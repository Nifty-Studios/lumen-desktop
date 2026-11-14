import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CELEBRATIONS, CELEBRATION_IDS } from "@lumen/shared/calendar";
import { BirthdayPicker } from "./Calendar";
import {
  ACCENT_PRESETS,
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
import { AccountError, type ImportSummary } from "@lumen/shared/client";
import type { Friend } from "@lumen/shared";
import { getVersion } from "@tauri-apps/api/app";
import { lumen } from "../db/client";
import { useAccount } from "../data/hooks";
import { useAmbient } from "../ambient/AmbientProvider";
import { weatherIcon } from "../ambient/Clock";
import { ScenePerch, ScenePreview } from "../ambient/Scene";
import { SCENES, type SceneId } from "@lumen/shared/scenes";
import { pickFile, saveBytes } from "../lib/files";
import { ambientSound } from "../lib/sound";
import { Icon } from "./Icon";
import { Button, Segmented, TextInput, Toggle, useToast } from "./ui";

export type SettingsSection = "account" | "friends" | "ai" | "appearance" | "calendar" | "dictionary" | "environment" | "location" | "data" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "friends", label: "Friends", icon: "users" },
  { id: "ai", label: "AI connection", icon: "wand-sparkles" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "calendar", label: "Calendar", icon: "calendar-days" },
  { id: "dictionary", label: "Dictionary", icon: "spell-check" },
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
      <ScenePerch />
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
          {section === "friends" && <Friends onSignIn={onSignIn} />}
          {section === "ai" && <AiConnection onSignIn={onSignIn} />}
          {section === "dictionary" && <Dictionary />}
          {section === "appearance" && <Appearance />}
          {section === "calendar" && <CalendarSettings />}
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

function CalendarSettings() {
  const { settings, update, preview, celebration } = useAmbient();
  const [birthday, setBirthday] = useState(lumen.profile.birthday);
  useEffect(() => lumen.profile.onChange(() => setBirthday(lumen.profile.birthday())), []);
  return (
    <>
      <Heading title="Calendar">Your events, the holidays and your birthday, with reminders when they come round.</Heading>
      <div className="py-3.5">
        <div className="mb-2 text-[14px]">Your birthday</div>
        <BirthdayPicker value={birthday} onChange={(v) => v && v !== birthday && void lumen.profile.setBirthday(v).catch(() => {})} />
        <div className="mt-1.5 text-[12.5px] text-muted">
          Saved to your account, so all your devices celebrate.
          {birthday && (
            <button className="ml-2 text-accent hover:underline" onClick={() => void lumen.profile.setBirthday(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
      <Field label="Reminders" hint="Notifications for your events, even while Lumen is closed.">
        <Toggle checked={settings.reminders} onChange={(reminders) => update({ reminders })} label="Reminders" />
      </Field>
      <Field label="Holidays" hint="New Year, Valentine's Day, Easter, Halloween and Christmas.">
        <Toggle checked={settings.holidays} onChange={(holidays) => update({ holidays })} label="Holidays" />
      </Field>
      <Field label="Good morning notes" hint="A notification on the morning of a holiday or your birthday.">
        <Toggle checked={settings.holidayAlerts} onChange={(holidayAlerts) => update({ holidayAlerts })} label="Good morning notes" />
      </Field>
      <Field label="Celebrations in the sky" hint="Special days take over the sky: fireworks, hearts, snow and lights, confetti.">
        <Toggle checked={settings.celebrations} onChange={(celebrations) => update({ celebrations })} label="Celebrations" />
      </Field>
      <div className="py-3.5">
        <div className="text-[14px]">Preview</div>
        <div className="mt-0.5 mb-2.5 text-[12.5px] text-muted">See each one for 20 seconds (close Settings to watch).</div>
        <div className="flex flex-wrap gap-1.5">
          {CELEBRATION_IDS.map((id) => (
            <button
              key={id}
              onClick={() => preview(celebration?.event.id === "preview" && celebration.celebration.id === id ? null : id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] transition-colors ${celebration?.event.id === "preview" && celebration.celebration.id === id ? "bg-accent text-accent-fg" : "bg-hover hover:bg-active"}`}
            >
              <Icon name={CELEBRATIONS[id].icon} size={14} />
              {CELEBRATIONS[id].name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function Appearance() {
  const { settings, update } = useAmbient();
  return (
    <>
      <Heading title="Appearance">Lumen shifts with the time of day.</Heading>
      <ThemePicker />
      <AccentPicker />
      <Field label="Light or dark">
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
      <Field label="Motion" hint="How much the sky moves.">
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
      <Field label="Spellcheck" hint="Underline misspelled words. Right-click one for corrections.">
        <Toggle label="Spellcheck" checked={settings.spellcheck} onChange={(spellcheck) => update({ spellcheck })} />
      </Field>
      {settings.spellcheck && (
        <Field label="Spelling" hint="Auto is American on US devices, British everywhere else.">
          <Segmented
            value={settings.spelling}
            onChange={(spelling) => update({ spelling })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "en-GB", label: "British" },
              { value: "en-US", label: "American" },
            ]}
          />
        </Field>
      )}
      <Field label="Ambient sound" hint="Rain and wind sounds that match the sky.">
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

/** The theme: drawn decor that lives with the sky, or just the sky. */
function ThemePicker() {
  const { settings, update, theme } = useAmbient();
  const sky = `linear-gradient(180deg, ${theme.skyTop}, ${theme.skyMid} 60%, ${theme.skyBottom})`;
  const card = (id: SceneId | null, name: string, description: string, icon: IconName) => {
    const active = settings.scene === id;
    return (
      <button
        key={id ?? "none"}
        onClick={() => update({ scene: id })}
        className={`group overflow-hidden rounded-2xl text-left transition-all hover:-translate-y-0.5 ${
          active ? "-translate-y-0.5 shadow-[0_18px_34px_-14px_var(--shadow)]" : "shadow-[0_10px_26px_-16px_var(--shadow)]"
        }`}
      >
        <div className="relative h-[104px] overflow-hidden" style={{ background: sky }}>
          {id ? <ScenePreview scene={id} /> : <Icon name="sun" size={26} className="absolute top-5 right-6 text-white/80" />}
          {active && (
            <span className="absolute top-2.5 left-2.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-fg">
              <Icon name="check" size={14} strokeWidth={2.4} />
            </span>
          )}
        </div>
        <div className={`px-3.5 py-2.5 ${active ? "bg-accent-soft" : "bg-hover"}`}>
          <div className="flex items-center gap-2 text-[13.5px] font-medium">
            <Icon name={icon} size={15} className={active ? "text-accent" : "text-muted"} />
            {name}
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">{description}</div>
        </div>
      </button>
    );
  };
  return (
    <div className="mb-3">
      <div className="text-[14px]">Theme</div>
      <div className="mt-0.5 mb-3 max-w-[56ch] text-[12.5px] text-muted">
        A little world around your notes. It keeps your real sky: lamps come on at night, snow settles, and the umbrella comes out when it rains.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {card(null, "Just the sky", "Nothing but the weather", "cloud-sun")}
        {SCENES.map((s) => card(s.id, s.name, s.description, s.icon))}
      </div>
    </div>
  );
}

/** Sky (the accent follows the time of day), a preset, or any color. */
function AccentPicker() {
  const { settings, update, sky, theme } = useAmbient();
  const live = useMemo(() => themeFor(sky, theme.dark, null).accent, [sky, theme.dark]);
  const custom = settings.accent && !ACCENT_PRESETS.some((p) => p.color === settings.accent) ? settings.accent : null;
  const swatch = (active: boolean, background: string, label: string, onClick: () => void) => (
    <button
      key={label}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-110 ${active ? "scale-110 shadow-[0_6px_16px_-6px_var(--shadow)]" : ""}`}
      style={{ background }}
    >
      {active && <Icon name="check" size={16} strokeWidth={2.6} className="text-white drop-shadow" />}
    </button>
  );
  return (
    <div className="py-3.5">
      <div className="text-[14px]">Accent color</div>
      <div className="mt-0.5 mb-3 text-[12.5px] text-muted">Buttons, links and highlights. “Sky” changes with the time of day.</div>
      <div className="flex flex-wrap items-center gap-2.5">
        {swatch(!settings.accent, "conic-gradient(from 200deg, #f08fb0, #6cb2ff, #f2aa5c, #a99cff, #f08fb0)", "Sky", () => update({ accent: null }))}
        {ACCENT_PRESETS.map((p) => swatch(settings.accent === p.color, p.color, p.name, () => update({ accent: p.color })))}
        <label
          title="Pick any color"
          className={`relative grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-110 ${custom ? "scale-110" : "bg-hover"}`}
          style={custom ? { background: custom } : undefined}
        >
          <Icon name={custom ? "check" : "pipette"} size={16} strokeWidth={custom ? 2.6 : 2} className={custom ? "text-white drop-shadow" : "text-muted"} />
          <input type="color" value={settings.accent ?? live} onChange={(e) => update({ accent: e.target.value })} className="absolute inset-0 opacity-0" />
        </label>
      </div>
    </div>
  );
}

// ---- dictionary ----------------------------------------------------------------------------

function Dictionary() {
  const [entries, setEntries] = useState(lumen.dictionary.entries);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string>();
  useEffect(() => lumen.dictionary.onChange(() => setEntries(lumen.dictionary.entries())), []);
  const q = filter.trim().toLowerCase();
  const shown = entries.filter((e) => !q || e.word.toLowerCase().includes(q) || e.meaning?.toLowerCase().includes(q));
  return (
    <>
      <Heading title="Dictionary">
        Words the spellchecker accepts, such as names, places and words you made up, each with a meaning if you like. Right-click an underlined word in a page to add it. Your dictionary syncs to your other devices.
      </Heading>
      <form
        className="mb-5 flex flex-col gap-2 rounded-2xl bg-hover p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (word.trim()) void lumen.dictionary.add(word.trim(), meaning);
          setWord("");
          setMeaning("");
        }}
      >
        <div className="flex gap-2">
          <TextInput placeholder="Word" value={word} onChange={(e) => setWord(e.target.value)} className="bg-surface" />
          <button type="submit" disabled={!word.trim()} className="flex flex-none items-center gap-2 rounded-xl bg-accent px-3.5 text-[13.5px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-50">
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
        <TextInput placeholder="Meaning (optional)" value={meaning} onChange={(e) => setMeaning(e.target.value)} className="bg-surface" />
      </form>
      {entries.length > 8 && <TextInput placeholder={`Search ${entries.length} words`} value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-3" />}
      {entries.length === 0 && <div className="rounded-2xl bg-hover px-4 py-5 text-[13.5px] text-muted">No words yet.</div>}
      <div className="-mx-2">
        {shown.map((e) => (
          <div key={e.word} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-hover">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{e.word}</div>
              {editing === e.word ? (
                <textarea
                  autoFocus
                  defaultValue={e.meaning ?? ""}
                  placeholder="What it means"
                  rows={2}
                  onBlur={(ev) => {
                    void lumen.dictionary.define(e.word, ev.target.value);
                    setEditing(undefined);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      ev.currentTarget.blur();
                    }
                    if (ev.key === "Escape") setEditing(undefined);
                  }}
                  className="mt-1 w-full resize-none rounded-lg bg-active px-2.5 py-1.5 text-[13px] leading-relaxed placeholder:text-faint"
                />
              ) : (
                <button onClick={() => setEditing(e.word)} className="mt-0.5 block text-left text-[13px] leading-relaxed text-muted hover:text-fg">
                  {e.meaning ?? <span className="text-faint">Add a meaning</span>}
                </button>
              )}
            </div>
            <button
              onClick={() => void lumen.dictionary.remove(e.word)}
              className="grid h-7 w-7 flex-none place-items-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-active hover:text-danger"
              aria-label={`Remove ${e.word}`}
              title="Remove"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- friends -------------------------------------------------------------------------------

/** The account's friends and requests, kept current (undefined while loading or signed out). */
export function useFriends() {
  const { user } = useAccount();
  const [friends, setFriends] = useState<Friend[]>();
  useEffect(() => {
    if (!user) return setFriends(undefined);
    const load = () => lumen.account.friends().then(setFriends, () => setFriends((f) => f ?? []));
    load();
    return lumen.onFriendsChanged(load);
  }, [user]);
  return [friends, setFriends] as const;
}

function Friends({ onSignIn }: { onSignIn: () => void }) {
  const { user } = useAccount();
  const toast = useToast();
  const [friends, setFriends] = useFriends();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!user)
    return (
      <>
        <Heading title="Friends">Add the people you share with. You need an account for this.</Heading>
        <Button tone="primary" icon="log-in" onClick={onSignIn}>
          Sign in or create an account
        </Button>
      </>
    );

  const act = async (task: () => Promise<Friend[]>) => {
    setBusy(true);
    setError(undefined);
    try {
      setFriends(await task());
      return true;
    } catch (e) {
      setError(e instanceof AccountError ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const groups: [string, Friend[]][] = [
    ["Asked you", friends?.filter((f) => f.status === "incoming") ?? []],
    ["Friends", friends?.filter((f) => f.status === "accepted") ?? []],
    ["Waiting for them", friends?.filter((f) => f.status === "outgoing") ?? []],
  ];

  return (
    <>
      <Heading title="Friends">Friends show up first when you share, so sharing takes one click.</Heading>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const to = email.trim();
          if (await act(() => lumen.account.addFriend(to))) {
            toast(`Friend request sent to ${to}`, { icon: "user-plus" });
            setEmail("");
          }
        }}
      >
        <TextInput type="email" required placeholder="Their email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={busy || !email.trim()} className="flex flex-none items-center gap-2 rounded-xl bg-accent px-3.5 text-[13.5px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-50">
          <Icon name="user-plus" size={16} /> Add friend
        </button>
      </form>
      {error && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-danger">
          <Icon name="triangle-alert" size={15} className="mt-0.5 flex-none" />
          {error}
        </p>
      )}
      {!friends && <div className="mt-6 text-[13px] text-muted">Loading…</div>}
      {friends?.length === 0 && <div className="mt-6 rounded-2xl bg-hover px-4 py-5 text-[13.5px] text-muted">No friends yet. Add someone by the email they use for Lumen.</div>}
      {groups.map(([title, list]) =>
        list.length ? (
          <div key={title} className="mt-6">
            <div className="mb-1.5 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">{title}</div>
            {list.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft text-[14px] font-medium text-accent">{f.user.name[0]?.toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px]">{f.user.name}</div>
                  <div className="truncate text-[12.5px] text-muted">{f.user.email}</div>
                </div>
                {f.status === "incoming" && (
                  <Button tone="primary" icon="user-check" disabled={busy} onClick={() => void act(() => lumen.account.acceptFriend(f.id))}>
                    Accept
                  </Button>
                )}
                <button
                  onClick={() => void act(() => lumen.account.removeFriend(f.id))}
                  className={`rounded-lg px-2.5 py-1 text-[12.5px] text-muted hover:bg-active hover:text-danger ${f.status === "accepted" ? "opacity-0 group-hover:opacity-100" : ""}`}
                >
                  {f.status === "incoming" ? "Decline" : f.status === "outgoing" ? "Cancel" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        ) : null,
      )}
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
        Show your real sky, or pick a mood.
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
        Used for sunrise, sunset and the weather.
      </Heading>
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-hover p-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon name="map-pin" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">{loc?.label ?? "Not set yet"}</div>
          <div className="text-[12.5px] text-muted">{loc ? source : "Guessed from your timezone"}</div>
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
      <Heading title="Backup & import">Save a copy of your notes, or bring them in from Notion.</Heading>

      <DataCard icon="file-archive" title="Back up everything">
        All your notes in one file. Restore it on any device.
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
        In Notion, go to <span className="text-fg">Settings → Export all workspace content</span> and choose <span className="text-fg">Markdown & CSV</span>. Then pick the .zip here.
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
        <Heading title="Account">Your notes stay on this device.</Heading>
      </>
    );
  if (!user)
    return (
      <>
        <Heading title="Account">
          Sign in to see your notes on all your devices and share pages.
        </Heading>
        <Button tone="primary" icon="log-in" onClick={onSignIn}>
          Sign in or create an account
        </Button>
      </>
    );
  return (
    <>
      <Heading title="Account">Your notes sync across your devices.</Heading>
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
        Your notes stay here after you sign out. They just stop syncing.
      </p>
    </>
  );
}

// ---- AI connection -------------------------------------------------------------------------

function AiConnection({ onSignIn }: { onSignIn: () => void }) {
  const { user } = useAccount();
  const toast = useToast();
  const [links, setLinks] = useState<{ id: string; created_at: number; last_used_at: number }[]>();
  const [fresh, setFresh] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) lumen.account.aiLinks().then(setLinks, () => setLinks([]));
  }, [user]);

  if (!user)
    return (
      <>
        <Heading title="AI connection">Let Claude read and organize your notes. You need an account for this.</Heading>
        <Button tone="primary" icon="log-in" onClick={onSignIn}>
          Sign in or create an account
        </Button>
      </>
    );

  const create = async () => {
    setBusy(true);
    try {
      const url = await lumen.account.createAiLink();
      setFresh(url);
      setLinks(await lumen.account.aiLinks());
    } catch (e) {
      toast(String(e), { tone: "error" });
    }
    setBusy(false);
  };

  return (
    <>
      <Heading title="AI connection">
        A private link that lets Claude read and edit your notes.
      </Heading>

      {fresh ? (
        <div className="mb-5 rounded-2xl bg-accent-soft p-4">
          <div className="mb-2 text-[13px] font-medium">Your link. Copy it now and keep it private.</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 text-[12px]">{fresh}</code>
            <Button
              tone="primary"
              icon="copy"
              onClick={async () => {
                await navigator.clipboard.writeText(fresh);
                toast("Link copied", { icon: "copy" });
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <Button tone="primary" icon="link" disabled={busy} onClick={create}>
            Create a link
          </Button>
        </div>
      )}

      <div className="mb-6 space-y-2 text-[13.5px] leading-relaxed text-muted">
        <p className="font-medium text-fg">How to connect</p>
        <p>In Claude, open Settings → Connectors → Add custom connector, name it “Lumen” and paste the link.</p>
        <p>Then ask things like “Add milk to my groceries page”.</p>
      </div>

      {links && links.length > 0 && (
        <>
          <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Active links</div>
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-hover">
              <Icon name="link" size={15} className="text-muted" />
              <span className="flex-1 text-[13px]">
                Created {new Date(l.created_at).toLocaleDateString()} · used {new Date(l.last_used_at).toLocaleDateString()}
              </span>
              <button
                onClick={async () => {
                  await lumen.account.revokeAiLink(l.id);
                  setLinks(await lumen.account.aiLinks());
                  setFresh(undefined);
                }}
                className="rounded-lg px-2.5 py-1 text-[12.5px] text-danger hover:bg-active"
              >
                Revoke
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ---- about -------------------------------------------------------------------------------

function About() {
  const status = lumen.sync?.current;
  const [version, setVersion] = useState("");
  useEffect(() => void getVersion().then(setVersion, () => {}), []);
  return (
    <>
      <Heading title="About Lumen">A calm place for your notes.</Heading>
      <div className="space-y-1 text-[13.5px]">
        <Field label="Version">
          <span className="text-muted">{version}</span>
        </Field>
        <Field label="This device">
          <span className="font-mono text-[12px] text-muted">{lumen.store.deviceId.slice(-12)}</span>
        </Field>
        <Field label="Sync" hint={lumen.account.current ? "On across your devices." : "Only on this device."}>
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
