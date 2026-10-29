import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ENV_TIMES,
  ENV_WEATHERS,
  MOODS,
  computeSky,
  searchPlaces,
  themeFor,
  type Mood,
  type Place,
} from "@lumen/shared/ambient";
import type { IconName } from "@lumen/shared/icons";
import type { ImportSummary } from "@lumen/shared/client";
import { lumen } from "../db/client";
import { useAccount } from "../data/hooks";
import { useAmbient } from "../ambient/AmbientProvider";
import { weatherIcon } from "../ambient/Clock";
import { pickFile, saveBytes } from "../lib/files";
import { ambientSound } from "../lib/sound";
import { Icon } from "./Icon";
import { Button, Segmented, Toggle, useToast } from "./ui";

export type SettingsSection = "account" | "appearance" | "environment" | "location" | "data" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "environment", label: "Sky & mood", icon: "cloud-sun" },
  { id: "location", label: "Location & weather", icon: "map-pin" },
  { id: "data", label: "Backup & import", icon: "package" },
  { id: "about", label: "About", icon: "info" },
];

interface SettingsProps {
  initial?: SettingsSection;
  onClose: () => void;
  onSignIn: () => void;
  onSignedOut: () => void;
}

export function Settings({ initial = "appearance", onClose, onSignIn, onSignedOut }: SettingsProps) {
  const [section, setSection] = useState<SettingsSection>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "var(--scrim)" }} onMouseDown={onClose}>
      <div className="surface animate-pop flex h-[min(620px,88vh)] w-[min(880px,94vw)] overflow-hidden rounded-[28px]" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="flex w-56 flex-none flex-col gap-0.5 p-3 pt-5" style={{ background: "var(--hover)" }}>
          <div className="px-3 pb-3 font-serif text-[22px] font-semibold">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors ${
                section === s.id ? "bg-surface text-fg shadow-[0_2px_10px_-4px_var(--shadow)]" : "text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              <Icon name={s.icon} size={16} />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="relative flex-1 overflow-y-auto px-9 py-7">
          <button onClick={onClose} className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
          {section === "account" && <Account onSignIn={onSignIn} onSignedOut={onSignedOut} />}
          {section === "appearance" && <Appearance />}
          {section === "environment" && <Environment />}
          {section === "location" && <Location />}
          {section === "data" && <Data />}
          {section === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-[26px] font-semibold tracking-tight">{title}</h2>
      {children && <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div>
        <div className="text-[14px]">{label}</div>
        {hint && <div className="mt-0.5 max-w-[40ch] text-[12.5px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// ---- appearance ---------------------------------------------------------------------------

function Appearance() {
  const { settings, update } = useAmbient();
  return (
    <>
      <Heading title="Appearance">Light or dark, Lumen follows the sun: dark mode lifts a little by day and goes deep at night, light mode turns into warm paper after dark.</Heading>
      <Field label="Theme">
        <Segmented
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: "System", icon: "monitor" },
            { value: "light", label: "Light", icon: "sun" },
            { value: "dark", label: "Dark", icon: "moon" },
          ]}
        />
      </Field>
      <Field label="Motion" hint="Calm slows the sky down; Still paints it once and keeps it there.">
        <Segmented
          value={settings.motion}
          onChange={(motion) => update({ motion })}
          options={[
            { value: "full", label: "Alive" },
            { value: "calm", label: "Calm" },
            { value: "still", label: "Still" },
          ]}
        />
      </Field>
      <Field label="Clock">
        <Segmented
          value={settings.clock}
          onChange={(clock) => update({ clock })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "12h", label: "12-hour" },
            { value: "24h", label: "24-hour" },
          ]}
        />
      </Field>
      <Field label="Temperature">
        <Segmented
          value={settings.temperatureUnit}
          onChange={(temperatureUnit) => update({ temperatureUnit })}
          options={[
            { value: "c", label: "°C" },
            { value: "f", label: "°F" },
          ]}
        />
      </Field>
      <Field label="Ambient sound" hint="Soft rain, wind and distant thunder that follow the sky.">
        <Toggle
          label="Ambient sound"
          checked={settings.sound}
          onChange={(sound) => {
            if (sound) ambientSound.start();
            update({ sound });
          }}
        />
      </Field>
    </>
  );
}

// ---- environment --------------------------------------------------------------------------

function MoodCard({ mood, active, onPick }: { mood: Mood; active: boolean; onPick: () => void }) {
  const { settings, theme } = useAmbient();
  const preview = useMemo(() => {
    const sky = computeSky({ location: settings.location, envTime: mood.time, envWeather: mood.weather });
    return { sky, t: themeFor(sky, theme.dark) };
  }, [mood, settings.location, theme.dark]);
  const { sky, t } = preview;
  const icon = mood.id === "live" ? weatherIcon(sky.precip, sky.storm, sky.fog, sky.clouds, sky.daylight > 0.4) : mood.icon;

  return (
    <button
      onClick={onPick}
      className={`group overflow-hidden rounded-2xl text-left transition-all hover:-translate-y-0.5 ${
        active ? "-translate-y-0.5 shadow-[0_18px_34px_-14px_var(--shadow)]" : "shadow-[0_10px_26px_-16px_var(--shadow)]"
      }`}
    >
      <div className="relative h-24" style={{ background: `linear-gradient(180deg, ${t.skyTop}, ${t.skyMid} 60%, ${t.skyBottom})` }}>
        {sky.sun.visible > 0.1 && (
          <span
            className="absolute h-7 w-7 rounded-full"
            style={{
              right: 18,
              top: 14 + (1 - Math.min(1, sky.altitude / 50)) * 22,
              background: `radial-gradient(circle, #fffbe8, ${sky.sun.color} 70%)`,
              boxShadow: `0 0 26px 8px ${sky.sun.color}66`,
              opacity: sky.sun.visible * (1 - sky.sun.dim * 0.6),
            }}
          />
        )}
        {sky.moon.visible > 0.3 && <span className="absolute top-3.5 right-5 h-5 w-5 rounded-full bg-[#f2efe4] shadow-[0_0_18px_4px_rgba(240,236,220,0.35)]" />}
        <span className="absolute bottom-2.5 left-3 grid h-8 w-8 place-items-center rounded-xl bg-black/20 text-white backdrop-blur-md">
          <Icon name={icon} size={17} />
        </span>
        {active && (
          <span className="absolute top-2.5 left-3 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-fg">
            <Icon name="check" size={14} strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className={`px-3 py-2.5 transition-colors ${active ? "bg-accent-soft" : "bg-hover"}`}>
        <div className="text-[13.5px] font-medium">{mood.name}</div>
        <div className="truncate text-[12px] text-muted">{mood.id === "live" ? sky.label : mood.description}</div>
      </div>
    </button>
  );
}

function Environment() {
  const { settings, update } = useAmbient();
  return (
    <>
      <Heading title="Sky & mood">
        Live follows your real sun, clouds and rain. Pick a mood to set the scene yourself, or mix a time of day with any weather.
      </Heading>
      <div className="grid grid-cols-3 gap-3">
        {MOODS.map((m) => (
          <MoodCard key={m.id} mood={m} active={settings.envTime === m.time && settings.envWeather === m.weather} onPick={() => update({ envTime: m.time, envWeather: m.weather })} />
        ))}
      </div>
      <div className="mt-8 mb-2 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Mix your own</div>
      <Field label="Time of day">
        <Segmented value={settings.envTime} onChange={(envTime) => update({ envTime })} options={ENV_TIMES} />
      </Field>
      <Field label="Weather">
        <Segmented value={settings.envWeather} onChange={(envWeather) => update({ envWeather })} options={ENV_WEATHERS} />
      </Field>
    </>
  );
}

// ---- location -----------------------------------------------------------------------------

function Location() {
  const { settings, update, locateDevice, setLocation, weather, refreshWeather } = useAmbient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return setPlaces([]);
    const t = window.setTimeout(() => searchPlaces(query).then(setPlaces, () => setPlaces([])), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const loc = settings.location;
  const source = loc?.source === "device" ? "From this device" : loc?.source === "city" ? "Chosen city" : "Guessed from your timezone";

  return (
    <>
      <Heading title="Location & weather">
        Your location sets sunrise and sunset. With live weather on, Lumen asks Open-Meteo for the weather there about every 15 minutes. Only the coordinates are sent; nothing else leaves this device.
      </Heading>
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-hover p-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon name="map-pin" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">{loc?.label ?? "Not set yet"}</div>
          <div className="text-[12.5px] text-muted">{loc ? `${source} · ${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}` : "Using an estimate from your timezone"}</div>
        </div>
        <Button
          icon="locate-fixed"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const l = await locateDevice();
              toast(`Location set to ${l.label}`, { icon: "map-pin" });
            } catch (e) {
              toast(`Couldn't get this device's location: ${String(e).replace(/^Error: /, "")}`, { tone: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Locating…" : "Use this device"}
        </Button>
      </div>
      <div className="relative mb-6">
        <div className="flex items-center gap-2.5 rounded-2xl bg-hover px-4">
          <Icon name="search" size={16} className="text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Or search for a city" className="flex-1 bg-transparent py-3 text-[14px] placeholder:text-faint" />
        </div>
        {places.length > 0 && (
          <div className="surface absolute inset-x-0 top-full z-10 mt-1.5 rounded-2xl p-1.5">
            {places.map((p, i) => (
              <button
                key={i}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover"
                onClick={async () => {
                  setQuery("");
                  setPlaces([]);
                  await setLocation({ lat: p.lat, lon: p.lon, label: p.name, source: "city" });
                  toast(`Location set to ${p.name}`, { icon: "map-pin" });
                }}
              >
                <Icon name="map-pin" size={15} className="text-faint" />
                <span className="text-[13.5px]">{p.name}</span>
                <span className="truncate text-[12.5px] text-muted">{p.detail}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Field label="Live weather" hint={weather ? `Last updated ${new Date(weather.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "No reading yet"}>
        <div className="flex items-center gap-3">
          {settings.liveWeather && (
            <button className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" onClick={() => refreshWeather()} title="Refresh now">
              <Icon name="refresh-cw" size={15} />
            </button>
          )}
          <Toggle label="Live weather" checked={settings.liveWeather} onChange={(liveWeather) => update({ liveWeather })} />
        </div>
      </Field>
    </>
  );
}

// ---- data -----------------------------------------------------------------------------------

function Progress({ value }: { value: number }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-active">
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function DataCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl bg-hover p-5">
      <div className="mb-1.5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} size={18} />
        </span>
        <div className="text-[15px] font-medium">{title}</div>
      </div>
      <div className="pl-12 text-[13.5px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function Data() {
  const toast = useToast();
  const [busy, setBusy] = useState<null | "export" | "restore" | "notion">(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setProgress(0);
    try {
      await task();
    } catch (e) {
      toast(String(e).replace(/^Error: /, ""), { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Heading title="Backup & import">Your notes are yours. Take them anywhere as one file, and bring your Notion pages in.</Heading>

      <DataCard icon="file-archive" title="Back up everything">
        One .zip with your whole workspace and its history, plus every page as a readable Markdown file. Restore it on any device, even offline.
        <div className="mt-3 flex gap-2">
          <Button
            tone="primary"
            icon="download"
            disabled={!!busy}
            onClick={() =>
              run("export", async () => {
                const backup = await lumen.exportBackup();
                const path = await saveBytes(backup.fileName, backup.bytes);
                if (path) toast(`Backup saved: ${backup.manifest.pages} pages, ${(backup.bytes.length / 1024).toFixed(0)} KB`, { icon: "file-archive" });
              })
            }
          >
            {busy === "export" ? "Packing…" : "Export backup"}
          </Button>
          <Button
            icon="upload"
            disabled={!!busy}
            onClick={() =>
              run("restore", async () => {
                const file = await pickFile(".zip");
                if (!file) return;
                const result = await lumen.restoreBackup(file.bytes, (d, t) => setProgress(d / t));
                toast(`Restored ${result.pages} pages from ${new Date(result.createdAt).toLocaleDateString()}`, { icon: "archive-restore" });
              })
            }
          >
            {busy === "restore" ? "Restoring…" : "Restore from a backup"}
          </Button>
        </div>
        {busy === "restore" && <Progress value={progress} />}
      </DataCard>

      <DataCard icon="import" title="Import from Notion">
        In Notion, open <span className="text-fg">Settings → General → Export all workspace content</span>, choose <span className="text-fg">Markdown & CSV</span> with
        subpages included, then pick the downloaded .zip here. Your pages keep their nesting; databases become pages of rows. Importing the same export again skips what's already here.
        <div className="mt-3">
          <Button
            icon="file-up"
            disabled={!!busy}
            onClick={() =>
              run("notion", async () => {
                setSummary(null);
                const file = await pickFile(".zip");
                if (!file) return;
                const result = await lumen.importNotion(file.bytes, { onProgress: (d, t) => setProgress(d / t) });
                setSummary(result);
                toast(result.pages ? `Imported ${result.pages} pages from Notion` : (result.warnings[0] ?? "Nothing new to import"), {
                  tone: result.pages || result.skipped ? "info" : "error",
                });
              })
            }
          >
            {busy === "notion" ? "Importing…" : "Choose Notion export"}
          </Button>
        </div>
        {busy === "notion" && <Progress value={progress} />}
        {summary && (
          <div className="mt-3 rounded-xl bg-hover px-3.5 py-2.5 text-[13px]">
            <div className="text-fg">
              {summary.pages} pages · {summary.blocks} blocks · {summary.images} images · {summary.databases} databases
              {summary.skipped ? ` · ${summary.skipped} already here` : ""}
            </div>
            {summary.warnings.slice(0, 4).map((w, i) => (
              <div key={i} className="mt-1 text-muted">
                {w}
              </div>
            ))}
            {summary.warnings.length > 4 && <div className="mt-1 text-muted">…and {summary.warnings.length - 4} more notes</div>}
          </div>
        )}
      </DataCard>
    </>
  );
}

// ---- account -----------------------------------------------------------------------------

function Account({ onSignIn, onSignedOut }: { onSignIn: () => void; onSignedOut: () => void }) {
  const { user, available } = useAccount();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await lumen.signOut();
    setBusy(false);
    onSignedOut();
  };

  if (!available)
    return (
      <>
        <Heading title="Account">This build of Lumen has no sync server, so everything stays on this device.</Heading>
      </>
    );
  if (!user)
    return (
      <>
        <Heading title="Account">
          You're using Lumen on this device only. Sign in to sync your notes to your other devices, and to share pages with people.
        </Heading>
        <Button tone="primary" icon="log-in" onClick={onSignIn}>
          Sign in or create an account
        </Button>
      </>
    );
  return (
    <>
      <Heading title="Account">Signed in. Your notes sync to every device you sign in on.</Heading>
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-hover p-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-[18px] font-semibold text-accent">{user.name[0]?.toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{user.name}</div>
          <div className="truncate text-[13px] text-muted">{user.email}</div>
        </div>
      </div>
      <Button tone="soft" icon="log-out" disabled={busy} onClick={signOut}>
        Sign out
      </Button>
      <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
        Your notes stay on this device and keep working offline; they just stop syncing. If someone else signs in here, your unsent changes go to
        your account first, and then the device holds only their notes.
      </p>
    </>
  );
}

// ---- about -------------------------------------------------------------------------------

function About() {
  const status = lumen.sync?.current;
  return (
    <>
      <Heading title="About Lumen">A light, local-first place for your notes. Everything lives on this device; sync runs quietly in the background.</Heading>
      <div className="space-y-1 text-[13.5px]">
        <Field label="Version">
          <span className="text-muted">0.1.0</span>
        </Field>
        <Field label="This device">
          <span className="font-mono text-[12px] text-muted">{lumen.store.deviceId.slice(-12)}</span>
        </Field>
        <Field label="Sync" hint={lumen.account.current ? "Signed in: changes sync to your other devices." : lumen.sync ? "Signed out: notes stay on this device." : "No sync server configured; notes stay on this device."}>
          <span className="text-muted">
            {!lumen.sync ? "Off" : status?.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : status?.state ?? "Waiting"}
          </span>
        </Field>
        <Field label="Icons" hint="Lucide (ISC license)">
          <span />
        </Field>
      </div>
    </>
  );
}
