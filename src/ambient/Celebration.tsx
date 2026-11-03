// Special days in the sky, on a canvas behind the glass: fireworks for the New Year, rising
// hearts for Valentine's, drifting petals for Easter, bats and embers for Halloween, snow and
// fairy lights for Christmas, confetti (and balloons on a birthday) for a celebration.
// ~40fps, paused while the window is hidden, one still frame in "still" motion mode.

import { useEffect, useRef } from "react";
import type { Celebration as Spec } from "@lumen/shared/calendar";
import type { Motion } from "@lumen/shared/ambient";

type Effect = Spec["effect"];

interface P {
  kind: "spark" | "rocket" | "heart" | "petal" | "bat" | "ember" | "flake" | "confetti" | "balloon";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
  phase: number;
  /** Rockets: the height they burst at. */
  target?: number;
  px?: number;
  py?: number;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

const FIREWORK = ["#ffd36b", "#ff7ab6", "#7ad7ff", "#b69cff", "#ff9a5c", "#9dffb0", "#ffffff"];
const HEARTS = ["#ff5c8a", "#ff8fb1", "#ff3d6e", "#ffb3c8", "#e04875"];
const PETALS = ["#ffd1e8", "#e8d4ff", "#fff1a8", "#c9f2d4", "#ffe0c2"];
const CONFETTI = ["#ff5c8a", "#ffd36b", "#5cc8ff", "#8be37a", "#b69cff", "#ff9a5c"];
const BULBS = ["#ff4d4d", "#ffd24d", "#4dd77a", "#5ab8ff", "#ff8ad8"];

function heart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.fill();
}

function bat(ctx: CanvasRenderingContext2D, s: number, flap: number) {
  const w = flap * s * 0.55;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.5, -w - s * 0.2, -s, -w * 0.6);
  ctx.quadraticCurveTo(-s * 0.7, s * 0.05, -s * 0.45, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.02, 0, s * 0.25);
  ctx.quadraticCurveTo(s * 0.2, s * 0.02, s * 0.45, s * 0.12);
  ctx.quadraticCurveTo(s * 0.7, s * 0.05, s, -w * 0.6);
  ctx.quadraticCurveTo(s * 0.5, -w - s * 0.2, 0, 0);
  ctx.fill();
}

export function Celebration({ effect, motion, dark }: { effect: Effect; motion: Motion; dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const calm = motion !== "full";
    let w = 0;
    let h = 0;
    let ps: P[] = [];
    let spawnIn = 0;
    let balloonIn = r(1, 3);

    const base = (kind: P["kind"], over: Partial<P>): P => ({ kind, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 10, size: 4, color: "#fff", rot: 0, spin: 0, phase: Math.random() * 6.28, ...over });

    const spawn = (anywhere: boolean) => {
      switch (effect) {
        case "fireworks":
          ps.push(base("rocket", { x: r(0.12, 0.88) * w, y: h + 10, vy: -r(0.55, 0.8) * h, target: r(0.08, 0.42) * h, color: pick(FIREWORK), max: 4 }));
          break;
        case "hearts":
          ps.push(base("heart", { x: r(0, w), y: anywhere ? r(0, h) : h + 30, vy: -r(18, 46), size: r(6, 17), color: pick(HEARTS), max: 60, spin: r(-0.4, 0.4) }));
          break;
        case "petals":
          ps.push(base("petal", { x: r(-40, w), y: anywhere ? r(0, h) : -20, vx: r(8, 26), vy: r(18, 42), size: r(4, 9), color: pick(PETALS), max: 80, rot: r(0, 6.28), spin: r(-1.6, 1.6) }));
          break;
        case "bats":
          if (Math.random() < 0.35 && ps.filter((p) => p.kind === "bat").length < (calm ? 3 : 6)) {
            const left = Math.random() < 0.5;
            ps.push(base("bat", { x: left ? -40 : w + 40, y: r(0.05, 0.45) * h, vx: (left ? 1 : -1) * r(50, 110), size: r(10, 20), color: dark ? "rgba(8,4,14,0.85)" : "rgba(30,14,40,0.75)", max: 60 }));
          } else ps.push(base("ember", { x: r(0, w), y: anywhere ? r(0, h) : h + 10, vy: -r(14, 40), vx: r(-6, 6), size: r(1, 2.6), color: pick(["#ff9b3d", "#ffcf6b", "#ff6a2a"]), max: 40 }));
          break;
        case "snow-lights":
          ps.push(base("flake", { x: r(-20, w), y: anywhere ? r(0, h) : -10, vx: r(-6, 10), vy: r(22, 58), size: r(1, 3.4), color: "#ffffff", max: 90 }));
          break;
        case "confetti":
        case "confetti-balloons":
          ps.push(base("confetti", { x: r(0, w), y: anywhere ? r(0, h) : -12, vx: r(-14, 14), vy: r(40, 90), size: r(4, 8), color: pick(CONFETTI), max: 60, rot: r(0, 6.28), spin: r(-5, 5) }));
          break;
      }
    };

    const rate = () => {
      const area = (w * h) / 1e6;
      const k = calm ? 0.45 : 1;
      switch (effect) {
        case "fireworks":
          return 0.8 * k; // rockets per second
        case "hearts":
          return 2.2 * area * k;
        case "petals":
          return 5 * area * k;
        case "bats":
          return 3 * area * k;
        case "snow-lights":
          return 22 * area * k;
        default:
          return 9 * area * k;
      }
    };

    const burst = (p: P) => {
      const n = calm ? 40 : 70;
      const color2 = pick(FIREWORK);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r(-0.05, 0.05);
        const v = r(50, 170);
        ps.push(base("spark", { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: i % 3 ? p.color : color2, size: r(1.2, 2.2), max: r(1.2, 2.1) }));
      }
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    // Start mid-scene rather than empty.
    const prefill = effect === "fireworks" ? 0 : Math.round(rate() * 25);
    for (let i = 0; i < prefill; i++) spawn(true);

    const step = (dt: number, t: number) => {
      spawnIn -= dt;
      while (spawnIn <= 0) {
        spawn(false);
        spawnIn += 1 / Math.max(0.05, rate());
      }
      if (effect === "confetti-balloons" && (balloonIn -= dt) <= 0) {
        balloonIn = r(2.5, 5) * (calm ? 2 : 1);
        ps.push(base("balloon", { x: r(0.05, 0.95) * w, y: h + 60, vy: -r(30, 55), size: r(16, 26), color: pick(CONFETTI), max: 60 }));
      }
      const next: P[] = [];
      for (const p of ps) {
        p.life += dt;
        p.px = p.x;
        p.py = p.y;
        if (p.kind === "rocket") {
          p.y += p.vy * dt;
          p.x += Math.sin(t * 0.004 + p.phase) * 0.3;
          if (p.y <= p.target!) {
            burst(p);
            continue;
          }
        } else if (p.kind === "spark") {
          p.vx *= 0.985;
          p.vy = p.vy * 0.985 + 55 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        } else if (p.kind === "bat") {
          p.x += p.vx * dt;
          p.y += Math.sin(p.life * 2 + p.phase) * 18 * dt;
        } else {
          const sway = p.kind === "heart" || p.kind === "balloon" ? Math.sin(p.life * 1.3 + p.phase) * 14 : p.kind === "petal" || p.kind === "flake" ? Math.sin(p.life * 1.1 + p.phase) * 16 : 0;
          p.x += (p.vx + sway) * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
        }
        const gone = p.life > p.max || p.y < -80 || p.y > h + 80 || p.x < -120 || p.x > w + 120;
        if (!gone) next.push(p);
      }
      ps = next;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (effect === "snow-lights") drawLights(t);
      for (const p of ps) {
        const fade = Math.min(1, p.life * 2, (p.max - p.life) * 1.5);
        switch (p.kind) {
          case "rocket":
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y + 14);
            ctx.stroke();
            break;
          case "spark": {
            const k = 1 - p.life / p.max;
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = Math.max(0, k) * (0.6 + 0.4 * Math.sin(t * 0.03 + p.phase));
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(p.px ?? p.x, p.py ?? p.y);
            ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
            ctx.stroke();
            ctx.globalCompositeOperation = "source-over";
            break;
          }
          case "heart":
            ctx.globalAlpha = 0.75 * fade * Math.min(1, p.y / (h * 0.25));
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.sin(p.life + p.phase) * 0.25);
            heart(ctx, p.size);
            ctx.restore();
            break;
          case "petal":
            ctx.globalAlpha = 0.85 * fade;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, 0.55 + 0.45 * Math.sin(p.life * 3 + p.phase));
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
          case "bat":
            ctx.globalAlpha = Math.min(1, p.life);
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            bat(ctx, p.size, Math.sin(p.life * 14 + p.phase));
            ctx.restore();
            break;
          case "ember":
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = fade * (0.45 + 0.4 * Math.sin(t * 0.008 + p.phase));
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
            break;
          case "flake":
            ctx.globalAlpha = 0.85 * fade;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
          case "confetti":
            ctx.globalAlpha = 0.9 * fade;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(Math.cos(p.life * 6 + p.phase), 1);
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
            break;
          case "balloon": {
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = dark ? "rgba(255,255,255,0.35)" : "rgba(40,30,60,0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + p.size * 1.25);
            ctx.quadraticCurveTo(p.x + Math.sin(p.life * 2) * 8, p.y + p.size * 2.2, p.x, p.y + p.size * 3.2);
            ctx.stroke();
            const g = ctx.createRadialGradient(p.x - p.size * 0.35, p.y - p.size * 0.45, p.size * 0.1, p.x, p.y, p.size * 1.3);
            g.addColorStop(0, "rgba(255,255,255,0.85)");
            g.addColorStop(0.25, p.color);
            g.addColorStop(1, p.color);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size, p.size * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(p.x - 3, p.y + p.size * 1.25);
            ctx.lineTo(p.x + 3, p.y + p.size * 1.25);
            ctx.lineTo(p.x, p.y + p.size * 1.15);
            ctx.fill();
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    // Two strands of fairy lights draped along the top of the window.
    const drawLights = (t: number) => {
      for (const [y0, sag, offset] of [
        [4, 26, 0],
        [-2, 40, 23],
      ] as const) {
        const span = Math.max(260, w / 3);
        ctx.strokeStyle = dark ? "rgba(20,40,30,0.8)" : "rgba(30,50,40,0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = -offset; x <= w + span; x += 4) {
          const u = (((x + offset) % span) + span) % span / span;
          const y = y0 + Math.sin(u * Math.PI) * sag;
          if (x === -offset) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        let i = 0;
        for (let x = -offset + 18; x <= w; x += 38, i++) {
          const u = (((x + offset) % span) + span) % span / span;
          const y = y0 + Math.sin(u * Math.PI) * sag + 5;
          const on = motion === "still" ? 0.85 : 0.55 + 0.45 * Math.sin(t * 0.0022 + i * 1.7 + offset);
          const color = BULBS[(i + (offset ? 2 : 0)) % BULBS.length]!;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
          glow.addColorStop(0, color);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.45 * on;
          ctx.fillStyle = glow;
          ctx.fillRect(x - 16, y - 16, 32, 32);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.6 + 0.4 * on;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(x, y, 3, 4.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      acc += now - last;
      last = now;
      if (acc < 24) return;
      step(Math.min(acc, 80) / 1000, now);
      draw(now);
      acc = 0;
    };
    if (motion === "still") {
      if (effect === "fireworks") for (let i = 0; i < 3; i++) burst(base("rocket", { x: r(0.2, 0.8) * w, y: r(0.12, 0.35) * h, color: pick(FIREWORK) }));
      for (let i = 0; i < 12; i++) step(0.05, i * 50);
      draw(0);
    } else frame = requestAnimationFrame(loop);

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
  }, [effect, motion, dark]);

  return <canvas ref={canvas} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}
