// The living sky behind the app: gradient, stars, moon, a breathing sun in the top-right
// corner, drifting clouds that gather around the sun, fog, rain or snow, and lightning.

import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { moonLitPath } from "@lumen/shared/ambient";
import { useAmbient } from "./AmbientProvider";
import { Precipitation } from "./Precipitation";
import { ambientSound } from "../lib/sound";
import "./Sky.css";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Sky() {
  const { sky, theme, settings } = useAmbient();
  const calm = settings.motion !== "full";
  const vars = {
    "--stars": sky.stars,
    "--moon": sky.moon.visible,
    "--fog": sky.fog,
  } as CSSProperties;

  return (
    <div className="sky" style={vars} aria-hidden>
      <div className="sky-gradient" />
      <Stars shooting={settings.motion === "full" && sky.stars > 0.5} />
      <Moon phase={sky.moon.phase} visible={sky.moon.visible * (1 - sky.sun.dim * 0.85)} />
      <Sun altitude={sky.altitude} size={sky.sun.size} visible={sky.sun.visible} dim={sky.sun.dim} dark={theme.dark} />
      <Clouds cover={sky.clouds} wind={sky.wind} calm={calm} storm={sky.storm} />
      {sky.fog > 0 && <Fog />}
      {sky.precip !== "none" && <Precipitation kind={sky.precip} intensity={sky.intensity} wind={sky.wind} dark={theme.dark || sky.daylight < 0.4} motion={settings.motion} />}
      {sky.storm && settings.motion !== "still" && <Lightning sound={settings.sound} />}
      <div className="sky-vignette" />
    </div>
  );
}

// ---- stars ----------------------------------------------------------------------------

const Stars = memo(function Stars({ shooting }: { shooting: boolean }) {
  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 150 }, (_, i) => ({
      left: r() * 100,
      top: Math.pow(r(), 1.4) * 78,
      size: 0.6 + Math.pow(r(), 3) * 2.2,
      opacity: 0.35 + r() * 0.65,
      twinkle: i % 3 === 0,
      delay: r() * 6,
      duration: 3 + r() * 5,
    }));
  }, []);
  const [streak, setStreak] = useState<{ id: number; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!shooting) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setStreak({ id: Date.now(), top: 5 + Math.random() * 30, left: 20 + Math.random() * 55 });
        schedule();
      }, 22_000 + Math.random() * 50_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [shooting]);

  return (
    <div className="sky-stars">
      {stars.map((s, i) => (
        <span
          key={i}
          className={s.twinkle ? "star twinkle" : "star"}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
      {streak && <span key={streak.id} className="shooting-star" style={{ top: `${streak.top}%`, left: `${streak.left}%` }} />}
    </div>
  );
});

// ---- moon & sun -----------------------------------------------------------------------

// Both live in the top-right corner of the sky strip. A low sun sinks to the top edge of the page,
// which works as its horizon; the page glass thins out there so the glow shows through.

function Moon({ phase, visible }: { phase: number; visible: number }) {
  if (visible < 0.02) return null;
  return (
    <div className="sky-moon" style={{ left: "calc(100% - 104px)", top: 30, opacity: visible }}>
      <div className="moon-glow" />
      <svg viewBox="-1.1 -1.1 2.2 2.2" width="58" height="58">
        <circle r="1" fill="rgba(210, 220, 255, 0.07)" />
        <path d={moonLitPath(phase)} fill="#f4f1e6" />
        <circle cx="-0.28" cy="-0.22" r="0.16" fill="rgba(0,0,0,0.06)" />
        <circle cx="0.3" cy="0.25" r="0.11" fill="rgba(0,0,0,0.05)" />
        <circle cx="0.05" cy="0.5" r="0.08" fill="rgba(0,0,0,0.05)" />
      </svg>
    </div>
  );
}

function Sun({ altitude, size, visible, dim, dark }: { altitude: number; size: number; visible: number; dim: number; dark: boolean }) {
  if (visible < 0.02) return null;
  const high = Math.min(1, Math.max(0, altitude / 60));
  // In dark mode the sun is a softer presence; behind clouds it becomes a diffuse glow.
  const strength = visible * (dark ? 0.78 : 1);
  return (
    <div className="sky-sun" style={{ left: `calc(100% - ${86 + high * 40}px)`, top: 26 + (1 - high) * 30, "--sun-size": `${size}px` } as CSSProperties}>
      <div className="sun-halo" style={{ opacity: strength * (0.55 + 0.45 * (1 - dim)) }} />
      <div className="sun-rays" style={{ opacity: strength * 0.5 * (1 - dim) }} />
      <div className="sun-core" style={{ opacity: strength * (1 - dim * 0.82), filter: `blur(${dim * 6}px)` }} />
    </div>
  );
}

// ---- clouds -----------------------------------------------------------------------------

interface CloudSpec {
  top: number;
  width: number;
  duration: number;
  delay: number;
  opacity: number;
  puffs: { cx: number; cy: number; r: number }[];
  veil?: boolean;
  left?: number;
}

function makeCloud(r: () => number, depth: number): Omit<CloudSpec, "top" | "duration" | "delay"> {
  const count = 4 + Math.floor(r() * 4);
  const puffs = Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return { cx: 25 + t * 150 + (r() - 0.5) * 14, cy: 62 - Math.sin(t * Math.PI) * (16 + r() * 18), r: 16 + Math.sin(t * Math.PI) * (12 + r() * 16) };
  });
  return { width: 180 + depth * 260 + r() * 120, opacity: 0.5 + depth * 0.45, puffs };
}

const Clouds = memo(function Clouds(props: { cover: number; wind: number; calm: boolean; storm: boolean }) {
  const { cover, wind, calm, storm } = props;
  const count = cover < 0.04 ? 0 : Math.round(1 + cover * 11);
  const veils = cover > 0.3 ? (cover > 0.65 ? 3 : 2) : cover > 0.15 ? 1 : 0;
  const speed = (calm ? 0.55 : 1) * (0.7 + wind * 1.6);

  const clouds = useMemo(() => {
    const r = rng(42);
    const drifting: CloudSpec[] = Array.from({ length: count }, (_, i) => {
      const depth = r();
      const duration = (260 - depth * 120 + r() * 80) / speed;
      return { ...makeCloud(r, depth), top: 2 + r() * 40 + (i % 3) * 3, duration, delay: -r() * duration };
    });
    // Veils: clouds that hang around the sun (top-right corner) and sway across it, dimming it.
    const around: CloudSpec[] = Array.from({ length: veils }, (_, i) => ({
      ...makeCloud(r, 0.75),
      width: 190 + i * 50,
      opacity: 0.3 + i * 0.08,
      top: 1 + i * 2.5,
      left: 250 - i * 40,
      duration: (34 + i * 9) / Math.max(0.5, speed),
      delay: -i * 7,
      veil: true,
    }));
    return [...drifting, ...around];
  }, [count, veils, speed]);

  if (!clouds.length) return null;
  const overcast = Math.max(0, (cover - 0.7) / 0.3);
  return (
    <div className="sky-clouds">
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="cloud-soft" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <linearGradient id="cloud-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--cloud-light)" }} />
            <stop offset="1" style={{ stopColor: "var(--cloud-shade)" }} />
          </linearGradient>
        </defs>
      </svg>
      {overcast > 0 && <div className="cloud-deck" style={{ opacity: overcast * (storm ? 1 : 0.85) }} />}
      {clouds.map((c, i) => (
        <div
          key={i}
          className={c.veil ? "cloud veil" : "cloud"}
          style={{
            top: `${c.top}%`,
            left: c.veil ? `calc(100% - ${c.left}px)` : undefined,
            width: c.width,
            opacity: c.opacity * (0.55 + cover * 0.45),
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <svg viewBox="0 0 200 100" width="100%" style={{ overflow: "visible" }}>
            <g filter="url(#cloud-soft)" fill="url(#cloud-fill)">
              <ellipse cx="100" cy="70" rx="88" ry="20" />
              {c.puffs.map((p, j) => (
                <circle key={j} cx={p.cx} cy={p.cy} r={p.r} />
              ))}
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
});

function Fog() {
  return (
    <div className="sky-fog">
      <div className="fog-band a" />
      <div className="fog-band b" />
      <div className="fog-band c" />
    </div>
  );
}

// ---- lightning --------------------------------------------------------------------------

function Lightning({ sound }: { sound: boolean }) {
  const [flash, setFlash] = useState<{ id: number; bolt: string } | null>(null);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const x = 15 + Math.random() * 70;
        let px = x;
        let py = 0;
        const points = [`${px},${py}`];
        while (py < 45) {
          px += (Math.random() - 0.5) * 7;
          py += 3 + Math.random() * 6;
          points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
        }
        setFlash({ id: Date.now(), bolt: Math.random() < 0.55 ? points.join(" ") : "" });
        if (sound) ambientSound.thunder(Math.random());
        schedule();
      }, 7_000 + Math.random() * 16_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [sound]);
  if (!flash) return null;
  return (
    <div key={flash.id} className="sky-lightning">
      <div className="flash" />
      {flash.bolt && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="bolt">
          <polyline points={flash.bolt} fill="none" stroke="white" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
