// The time, the date and the sky in words, at the top of the sidebar.

import { useEffect, useState } from "react";
import { moodOf, type ClockFormat } from "@lumen/shared/ambient";
import type { IconName } from "@lumen/shared/icons";
import { Icon } from "../components/Icon";
import { useAmbient } from "./AmbientProvider";

function useNow(stepMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, stepMs - (Date.now() % stepMs) + 20);
    };
    timer = window.setTimeout(tick, stepMs - (Date.now() % stepMs) + 20);
    return () => window.clearTimeout(timer);
  }, [stepMs]);
  return now;
}

export function timeParts(date: Date, format: ClockFormat) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (format === "12h") opts.hour12 = true;
  if (format === "24h") opts.hourCycle = "h23";
  const parts = new Intl.DateTimeFormat(undefined, opts).formatToParts(date);
  const period = parts.find((p) => p.type === "dayPeriod")?.value;
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return { time, period };
}

const greeting = (h: number) => (h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night");

export function weatherIcon(precip: string, storm: boolean, fog: number, clouds: number, day: boolean): IconName {
  if (storm) return "cloud-lightning";
  if (precip === "snow") return "cloud-snow";
  if (precip === "rain") return "cloud-rain";
  if (precip === "drizzle") return "cloud-drizzle";
  if (fog) return "cloud-fog";
  if (clouds > 0.75) return "cloudy";
  if (clouds > 0.35) return day ? "cloud-sun" : "cloud-moon";
  return day ? "sun" : "moon";
}

export function Clock({ onOpenSky }: { onOpenSky: () => void }) {
  const { sky, settings } = useAmbient();
  const now = useNow(1000 * 15);
  const { time, period } = timeParts(now, settings.clock);
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const mood = moodOf(settings);
  const custom = !sky.live;
  const temp =
    sky.temperature === undefined
      ? undefined
      : `${Math.round(settings.temperatureUnit === "f" ? sky.temperature * 1.8 + 32 : sky.temperature)}°`;
  const next =
    settings.envTime === "live" && sky.sunrise && sky.sunset
      ? now.getTime() < sky.sunrise
        ? { label: "Sunrise", at: sky.sunrise }
        : now.getTime() < sky.sunset
          ? { label: "Sunset", at: sky.sunset }
          : undefined
      : undefined;

  return (
    <div className="px-4 pt-5 pb-3 select-none">
      <div className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">{greeting(now.getHours())}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-serif text-[46px] leading-none font-[350] tracking-tight tabular-nums">{time}</span>
        {period && <span className="font-serif text-lg text-muted">{period}</span>}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">{date}</div>
      <button
        onClick={onOpenSky}
        className="group mt-3 -ml-2 flex w-[calc(100%+16px)] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-hover"
        title="Change the sky"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon name={weatherIcon(sky.precip, sky.storm, sky.fog, sky.clouds, sky.daylight > 0.4)} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {custom ? (mood?.name ?? "Custom sky") : sky.label}
            {temp && !custom && <span className="text-muted"> · {temp}</span>}
          </span>
          <span className="block truncate text-[12px] text-muted">
            {custom
              ? "Mood · tap to change"
              : [settings.location?.label, next && `${next.label} ${timeParts(new Date(next.at), settings.clock).time}`].filter(Boolean).join(" · ") || "Live sky"}
          </span>
        </span>
        <Icon name="sliders-horizontal" size={15} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </div>
  );
}

