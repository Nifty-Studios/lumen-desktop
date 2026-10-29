// Owns everything the living sky needs: settings, the current time, the weather and the
// location, and turns them into a SkyState and theme colors (applied as CSS variables).

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { computeSky, themeFor, type LumenSettings, type SavedLocation, type SkyState, type ThemeTokens, type Weather } from "@lumen/shared/ambient";
import { lumen } from "../db/client";
import { bestLocation, deviceLocation } from "../lib/location";
import { ambientSound } from "../lib/sound";

interface Ambient {
  settings: LumenSettings;
  update: (patch: Partial<LumenSettings>) => Promise<void>;
  sky: SkyState;
  theme: ThemeTokens;
  weather: Weather | undefined;
  /** Asks the device for its location and saves it. Throws if location is unavailable. */
  locateDevice: () => Promise<SavedLocation>;
  setLocation: (loc: SavedLocation) => Promise<void>;
  refreshWeather: () => Promise<void>;
}

const AmbientContext = createContext<Ambient | null>(null);

export const useAmbient = () => {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error("useAmbient outside AmbientProvider");
  return ctx;
};

function useSystemDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark;
}

/** Re-renders at the start of every minute. */
function useMinute() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

const VARS: [keyof ThemeTokens, string][] = [
  ["skyTop", "--sky-top"],
  ["skyMid", "--sky-mid"],
  ["skyBottom", "--sky-bottom"],
  ["glass", "--glass"],
  ["surface", "--surface"],
  ["solid", "--solid"],
  ["text", "--text"],
  ["muted", "--muted"],
  ["faint", "--faint"],
  ["border", "--border"],
  ["hover", "--hover"],
  ["active", "--active"],
  ["accent", "--accent"],
  ["accentSoft", "--accent-soft"],
  ["accentText", "--accent-text"],
  ["selection", "--selection"],
  ["shadow", "--shadow"],
  ["scrim", "--scrim"],
  ["danger", "--danger"],
];

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(lumen.getSettings);
  const [weather, setWeather] = useState<Weather>();
  const now = useMinute();
  const systemDark = useSystemDark();
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);

  useEffect(() => lumen.onSettings(setSettings), []);

  const update = useCallback(async (patch: Partial<LumenSettings>) => {
    await lumen.updateSettings(patch);
  }, []);

  const refreshWeather = useCallback(async () => {
    const w = await lumen.refreshWeather({ force: true });
    setWeather(w);
  }, []);

  const setLocation = useCallback(async (loc: SavedLocation) => {
    await lumen.updateSettings({ location: loc });
    setWeather(await lumen.refreshWeather({ force: true }));
  }, []);

  const locateDevice = useCallback(async () => {
    const loc = await deviceLocation();
    await setLocation(loc);
    return loc;
  }, [setLocation]);

  // First run: find out where we are (device, else the timezone's city).
  useEffect(() => {
    if (lumen.getSettings().location) return;
    bestLocation().then((loc) => loc && setLocation(loc), console.error);
  }, [setLocation]);

  // Weather: the cached reading right away, then fresh every 15 minutes and on focus.
  useEffect(() => {
    let alive = true;
    lumen.cachedWeather().then((w) => alive && w && setWeather((cur) => cur ?? w));
    const refresh = () => lumen.refreshWeather().then((w) => alive && w && setWeather(w), console.error);
    refresh();
    const timer = window.setInterval(refresh, 15 * 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [settings.location, settings.liveWeather]);

  const sky = useMemo(
    () =>
      computeSky({
        now,
        location: settings.location,
        weather: settings.liveWeather ? weather : null,
        envTime: settings.envTime,
        envWeather: settings.envWeather,
      }),
    [now, settings.location, settings.liveWeather, settings.envTime, settings.envWeather, weather],
  );
  const theme = useMemo(() => themeFor(sky, dark), [sky, dark]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, name] of VARS) root.style.setProperty(name, String(theme[key]));
    root.style.setProperty("--cloud-light", sky.cloudLight);
    root.style.setProperty("--cloud-shade", sky.cloudShade);
    root.style.setProperty("--sun-color", sky.sun.color);
    root.style.colorScheme = theme.dark ? "dark" : "light";
    root.dataset.theme = theme.dark ? "dark" : "light";
    root.dataset.motion = settings.motion;
  }, [theme, sky, settings.motion]);

  // Ambient sound follows the weather on screen.
  useEffect(() => {
    if (!settings.sound) {
      ambientSound.stop();
      return;
    }
    ambientSound.start();
    const rain = sky.precip === "rain" ? sky.intensity : sky.precip === "drizzle" ? sky.intensity * 0.5 : 0;
    ambientSound.set({ rain, wind: sky.wind + (sky.precip === "snow" ? 0.15 : 0) });
  }, [settings.sound, sky.precip, sky.intensity, sky.wind]);

  const value = useMemo(
    () => ({ settings, update, sky, theme, weather, locateDevice, setLocation, refreshWeather }),
    [settings, update, sky, theme, weather, locateDevice, setLocation, refreshWeather],
  );
  return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>;
}
