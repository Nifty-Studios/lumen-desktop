// Rain, drizzle or snow on a canvas behind the glass. Runs at ~40fps, pauses while the
// window is hidden, draws a single still frame in "still" motion mode.

import { useEffect, useRef } from "react";
import type { Motion, Precipitation as Kind } from "@lumen/shared/ambient";

interface Props {
  kind: Exclude<Kind, "none">;
  intensity: number;
  wind: number;
  dark: boolean;
  motion: Motion;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  len: number;
  size: number;
  sway: number;
  alpha: number;
}

export function Precipitation({ kind, intensity, wind, dark, motion }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    const snow = kind === "snow";
    const drizzle = kind === "drizzle";
    const slant = (snow ? 0.15 : 0.35) * (0.3 + wind);
    const density = (motion === "full" ? 1 : 0.5) * (snow ? 0.00016 : drizzle ? 0.00018 : 0.00034) * (0.35 + intensity * 0.9);

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * (w + h * slant) - h * slant,
      y: anywhere ? Math.random() * h : -20 - Math.random() * 40,
      speed: snow ? 28 + Math.random() * 50 : drizzle ? 500 + Math.random() * 260 : 820 + Math.random() * 520,
      len: snow ? 0 : drizzle ? 6 + Math.random() * 7 : 12 + Math.random() * 16,
      size: snow ? 0.9 + Math.random() * 2.4 : drizzle ? 0.8 : 1 + Math.random() * 0.4,
      sway: Math.random() * Math.PI * 2,
      alpha: snow ? 0.55 + Math.random() * 0.45 : 0.18 + Math.random() * 0.32,
    });

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(w * h * density);
      particles = Array.from({ length: target }, () => spawn(true));
    };
    resize();

    const color = snow ? "255,255,255" : dark ? "190,210,255" : "235,242,255";
    const draw = (dt: number, t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (snow) {
        for (const p of particles) {
          p.y += p.speed * dt;
          p.x += (slant * p.speed + Math.sin(t * 0.0009 + p.sway) * 14) * dt;
          if (p.y > h + 10) Object.assign(p, spawn(false));
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${color})`;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      for (const p of particles) {
        p.y += p.speed * dt;
        p.x += slant * p.speed * dt;
        if (p.y > h + 20) Object.assign(p, spawn(false));
      }
      ctx.lineCap = "round";
      // Two strokes (fainter far drops, brighter near ones) keep draw calls to a minimum.
      for (const pass of [0, 1]) {
        ctx.beginPath();
        for (let i = pass; i < particles.length; i += 2) {
          const p = particles[i]!;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - slant * p.len, p.y - p.len);
        }
        ctx.strokeStyle = `rgba(${color},${pass ? 0.42 : 0.22})`;
        ctx.lineWidth = drizzle ? 0.8 : pass ? 1.2 : 1;
        ctx.stroke();
      }
    };

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      acc += now - last;
      last = now;
      if (acc < 24) return; // ~40fps is plenty for weather
      draw(Math.min(acc, 80) / 1000, now);
      acc = 0;
    };
    if (motion === "still") draw(0, 0);
    else frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && motion !== "still") {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, intensity, wind, dark, motion]);

  return <canvas ref={canvas} style={{ position: "absolute", inset: 0 }} />;
}
