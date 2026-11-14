// The calendar: a month of days to put stickers on. Drag a sticker from the box onto a day
// (or click a day) to plan something; drag an event to move it. Holidays and your birthday
// are already there. Events live in a workspace, so they sync and share like pages.

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ALL_DAY_REMINDER_OPTIONS,
  CELEBRATIONS,
  CELEBRATION_IDS,
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  STICKERS,
  addDays,
  ageOn,
  parseYmd,
  reminderLabel,
  stickerOf,
  today as todayYmd,
  ymd,
  type CalendarEvent,
  type CelebrationId,
  type Occurrence,
  type Repeat,
} from "@lumen/shared/calendar";
import { canEdit, type Role } from "@lumen/shared";
import type { Space } from "@lumen/shared/schema/client";
import { iconColor } from "@lumen/shared/icons";
import { lumen } from "../db/client";
import { listSpaces } from "../data/workspace";
import { useLive } from "../data/hooks";
import { useAmbient } from "../ambient/AmbientProvider";
import { ScenePerch } from "../ambient/Scene";
import { timeParts } from "../ambient/Clock";
import { Icon } from "./Icon";
import { Button, Popover, Select, TextInput, Toggle, useToast } from "./ui";

const STICKER_MIME = "application/x-lumen-sticker";
const EVENT_MIME = "application/x-lumen-event";

/** First day of the week for the device's locale: 0 = Sunday, 1 = Monday. */
function weekStart(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay ?? 1;
    return first % 7;
  } catch {
    return 1;
  }
}

/** Re-renders when the birthday or settings change (they aren't records, so useLive misses them). */
function useCalendarVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const a = lumen.profile.onChange(() => setV((n) => n + 1));
    const b = lumen.onSettings(() => setV((n) => n + 1));
    return () => {
      a();
      b();
    };
  }, []);
  return v;
}

export function useFormatTime() {
  const { settings } = useAmbient();
  return (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    const d = new Date();
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    const { time, period } = timeParts(d, settings.clock);
    return period ? `${time} ${period}` : time;
  };
}

function StickerBadge({ sticker, size = 22 }: { sticker: string; size?: number }) {
  const { theme } = useAmbient();
  const s = stickerOf(sticker);
  const color = iconColor(s.color, theme.dark) ?? "var(--accent)";
  return (
    <span className="grid flex-none place-items-center rounded-full" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}>
      <Icon name={s.icon} size={Math.round(size * 0.62)} />
    </span>
  );
}

interface Props {
  space: Space;
  role: Role | undefined;
  onShowSidebar?: (() => void) | undefined;
  onOpenSettings: () => void;
}

export function CalendarView({ space, role, onShowSidebar, onOpenSettings }: Props) {
  const [month, setMonth] = useState(() => todayYmd().slice(0, 8) + "01");
  const [selected, setSelected] = useState(todayYmd);
  const [editing, setEditing] = useState<{ id?: string; date: string; sticker?: string } | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const [stickerPop, setStickerPop] = useState<HTMLElement | null>(null);
  const version = useCalendarVersion();
  const formatTime = useFormatTime();
  const toast = useToast();
  const first = weekStart();

  const gridStart = useMemo(() => {
    const d = parseYmd(month);
    return addDays(month, -((d.getDay() - first + 7) % 7));
  }, [month, first]);
  const gridEnd = addDays(gridStart, 41);
  const occurrences = useLive(() => lumen.calendar.between(gridStart, addDays(gridEnd, 30)), [gridStart, version]) ?? [];
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences) map.set(o.date, [...(map.get(o.date) ?? []), o]);
    return map;
  }, [occurrences]);
  const today = todayYmd();
  const editable = canEdit(role);
  // Where new events go: this workspace, or the first one you can edit.
  const home = useLive(async () => (editable ? space.id : (await listSpaces()).find((s) => canEdit(s.role))?.space.id), [space.id, editable]);

  const monthName = parseYmd(month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdays = Array.from({ length: 7 }, (_, i) => parseYmd(addDays(gridStart, i)).toLocaleDateString(undefined, { weekday: "short" }));
  const shiftMonth = (n: number) => {
    const d = parseYmd(month);
    d.setMonth(d.getMonth() + n);
    setMonth(ymd(d));
  };

  const goTo = (date: string) => {
    setMonth(date.slice(0, 8) + "01");
    setSelected(date);
  };

  // Arrow keys move the selected day, Page Up/Down the month, T jumps to today
  // (when nothing else has the keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || picker || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || document.querySelector(".fixed.inset-0")) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) goTo(addDays(selected, step));
      else if (e.key === "PageUp" || e.key === "PageDown") {
        const d = parseYmd(selected);
        d.setMonth(d.getMonth() + (e.key === "PageUp" ? -1 : 1));
        goTo(ymd(d));
      } else if (e.key === "t" || e.key === "T" || e.key === "Home") goTo(today);
      else if (e.key === "Enter" && home) setEditing({ date: selected });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pickSticker = (id: string) => setEditing({ date: selected, sticker: id });

  const onDrop = async (e: DragEvent, date: string) => {
    e.preventDefault();
    setDropDay(null);
    const sticker = e.dataTransfer.getData(STICKER_MIME);
    const eventId = e.dataTransfer.getData(EVENT_MIME);
    try {
      if (sticker) {
        if (!home) return toast("You can only view this workspace.", { tone: "error", icon: "lock" });
        const id = await lumen.calendar.createEvent(home, { date, sticker, title: stickerOf(sticker).label });
        setSelected(date);
        setEditing({ id, date });
      } else if (eventId) {
        await lumen.calendar.updateEvent(eventId, { date });
        setSelected(date);
      }
    } catch (err) {
      toast(String(err instanceof Error ? err.message : err), { tone: "error" });
    }
  };

  const dayList = byDay.get(selected) ?? [];
  const upcoming = occurrences.filter((o) => o.date > selected && o.date <= addDays(selected, 30)).slice(0, 12);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-6 pt-5 pb-3">
        {onShowSidebar && (
          <button onClick={onShowSidebar} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" title="Show sidebar (Ctrl \)">
            <Icon name="panel-left" size={17} />
          </button>
        )}
        <button
          onClick={(e) => setPicker(picker ? null : e.currentTarget)}
          className={`-ml-2 flex items-center gap-1.5 rounded-xl px-2 py-1 transition-colors hover:bg-hover ${picker ? "bg-hover" : ""}`}
          title="Pick a month and year"
        >
          <h1 className="font-serif text-[28px] leading-none font-semibold tracking-tight">{monthName}</h1>
          <Icon name="chevron-down" size={18} className="mt-1 text-faint" />
        </button>
        <span className="flex-1" />
        {home && (
          <button
            onClick={(e) => setStickerPop(stickerPop ? null : e.currentTarget)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg lg:hidden"
          >
            <Icon name="sticky-note" size={15} />
            Stickers
          </button>
        )}
        <button onClick={() => shiftMonth(-1)} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Previous month" title="Previous month (Page Up)">
          <Icon name="chevron-left" size={17} />
        </button>
        <button
          onClick={() => goTo(today)}
          className="rounded-xl px-3 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
          title="Today (T)"
        >
          Today
        </button>
        <button onClick={() => shiftMonth(1)} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Next month" title="Next month (Page Down)">
          <Icon name="chevron-right" size={17} />
        </button>
        {home && (
          <Button icon="calendar-plus" tone="primary" onClick={() => setEditing({ date: selected })}>
            New event
          </Button>
        )}
      </header>

      {picker && <MonthPicker anchor={picker} month={month} today={today} onPick={(m) => (setMonth(m), setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m))} onClose={() => setPicker(null)} />}
      {stickerPop && (
        <Popover anchor={stickerPop} onClose={() => setStickerPop(null)} width={300} align="end">
          <StickerBox
            onPick={(id) => {
              setStickerPop(null);
              pickSticker(id);
            }}
            onDragStart={() => setStickerPop(null)}
          />
        </Popover>
      )}

      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-7 pb-1.5">
            {weekdays.map((w) => (
              <div key={w} className="px-2 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
                {w}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
            {Array.from({ length: 42 }, (_, i) => {
              const date = addDays(gridStart, i);
              const items = byDay.get(date) ?? [];
              const inMonth = date.slice(0, 7) === month.slice(0, 7);
              const isToday = date === today;
              return (
                <div
                  key={date}
                  onClick={() => setSelected(date)}
                  onDoubleClick={() => home && setEditing({ date })}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dropDay !== date) setDropDay(date);
                  }}
                  onDragLeave={() => setDropDay((d) => (d === date ? null : d))}
                  onDrop={(e) => void onDrop(e, date)}
                  className={`flex min-h-0 cursor-default flex-col overflow-hidden rounded-xl p-1.5 transition-colors ${
                    dropDay === date ? "bg-accent-soft" : selected === date ? "bg-active" : "hover:bg-hover"
                  } ${inMonth ? "" : "opacity-45"}`}
                >
                  <span
                    className={`mb-1 grid h-6 min-w-6 place-items-center self-start rounded-full px-1.5 text-[12.5px] tabular-nums ${isToday ? "bg-accent font-semibold text-accent-fg" : "text-muted"}`}
                  >
                    {parseYmd(date).getDate()}
                  </span>
                  <div className="flex min-h-0 flex-col gap-0.5">
                    {items.slice(0, 3).map((o) => (
                      <EventChip key={o.event.id + o.date} occ={o} formatTime={formatTime} onOpen={() => setEditing({ id: o.event.id, date: o.date })} />
                    ))}
                    {items.length > 3 && <span className="px-1 text-[11px] text-faint">+{items.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="hidden w-[272px] flex-none flex-col gap-4 overflow-y-auto lg:flex">
          {home && <StickerBox onPick={pickSticker} />}
          <section>
            <div className="px-1 pb-1.5 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
              {selected === today ? "Today" : parseYmd(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </div>
            {dayList.length ? (
              dayList.map((o) => <AgendaRow key={o.event.id + o.date} occ={o} formatTime={formatTime} onOpen={() => setEditing({ id: o.event.id, date: o.date })} />)
            ) : (
              <div className="rounded-xl px-2 py-2 text-[13px] text-muted">
                Nothing planned.{" "}
                {home && (
                  <button className="text-accent hover:underline" onClick={() => setEditing({ date: selected })}>
                    Add something
                  </button>
                )}
              </div>
            )}
          </section>
          {upcoming.length > 0 && (
            <section>
              <div className="px-1 pb-1.5 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Coming up</div>
              {upcoming.map((o) => (
                <AgendaRow key={o.event.id + o.date} occ={o} formatTime={formatTime} showDate onOpen={() => setEditing({ id: o.event.id, date: o.date })} />
              ))}
            </section>
          )}
        </aside>
      </div>

      {editing && (
        <EventDialog
          id={editing.id}
          date={editing.date}
          sticker={editing.sticker}
          spaceId={home ?? null}
          onClose={() => setEditing(null)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}

/** The stickers, in a box: drag one onto a day, or click it to plan something on the selected day. */
function StickerBox({ onPick, onDragStart }: { onPick: (id: string) => void; onDragStart?: () => void }) {
  return (
    <section className="rounded-2xl bg-hover p-3">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Stickers</span>
        <span className="text-[11.5px] text-faint">Drag onto a day</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {STICKERS.map((s) => (
          <button
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(STICKER_MIME, s.id);
              e.dataTransfer.effectAllowed = "copy";
              // Let the popover go once the drag has started (closing it sooner cancels the drag).
              if (onDragStart) window.setTimeout(onDragStart, 0);
            }}
            onClick={() => onPick(s.id)}
            title={`${s.label}: drag onto a day, or click to add it to the selected day`}
            className="group flex cursor-grab flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 transition-colors hover:bg-active active:cursor-grabbing"
          >
            <span className="transition-transform group-hover:scale-110">
              <StickerBadge sticker={s.id} size={32} />
            </span>
            <span className="w-full truncate text-center text-[10.5px] text-muted">{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Jump anywhere: step through years, pick a month. */
function MonthPicker({ anchor, month, today, onPick, onClose }: { anchor: HTMLElement; month: string; today: string; onPick: (month: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" }));
  const pick = (m: number) => {
    onPick(`${year}-${String(m + 1).padStart(2, "0")}-01`);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={292}>
      <div className="p-1.5">
        <div className="mb-2 flex items-center gap-1">
          <button onClick={() => setYear((y) => y - 1)} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Previous year">
            <Icon name="chevron-left" size={16} />
          </button>
          <span className="flex-1 text-center font-serif text-[18px] font-semibold tabular-nums">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Next year">
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {months.map((name, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const current = key === month.slice(0, 7);
            const now = key === today.slice(0, 7);
            return (
              <button
                key={name}
                onClick={() => pick(i)}
                className={`rounded-xl py-2.5 text-[13.5px] transition-colors ${current ? "bg-accent font-medium text-accent-fg" : now ? "bg-accent-soft text-accent hover:brightness-110" : "text-fg hover:bg-hover"}`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            onPick(today.slice(0, 8) + "01");
            onClose();
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] text-accent hover:bg-hover"
        >
          <Icon name="calendar-days" size={14} />
          Back to today
        </button>
        <div className="mt-1 px-1 pb-0.5 text-center text-[11px] leading-snug text-faint">Arrow keys move the day · Page Up/Down the month · T for today</div>
      </div>
    </Popover>
  );
}

function EventChip({ occ, formatTime, onOpen }: { occ: Occurrence; formatTime: (hm: string) => string; onOpen: () => void }) {
  const { event } = occ;
  const movable = !event.builtin && event.editable;
  return (
    <button
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(EVENT_MIME, event.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`flex min-w-0 items-center gap-1 rounded-lg py-0.5 pr-1.5 pl-0.5 text-left text-[12px] transition-colors hover:bg-hover ${event.builtin ? "text-muted" : ""}`}
    >
      <StickerBadge sticker={event.sticker} size={18} />
      {event.time && <span className="flex-none text-[11px] text-faint tabular-nums">{formatTime(event.time)}</span>}
      <span className="truncate">{event.title || "Untitled"}</span>
    </button>
  );
}

function AgendaRow({ occ, formatTime, onOpen, showDate }: { occ: Occurrence; formatTime: (hm: string) => string; onOpen: () => void; showDate?: boolean }) {
  const { event, date } = occ;
  const when = [showDate && parseYmd(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), event.time ? formatTime(event.time) + (event.endTime ? `–${formatTime(event.endTime)}` : "") : "All day"]
    .filter(Boolean)
    .join(" · ");
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-hover">
      <StickerBadge sticker={event.sticker} size={26} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{event.title || "Untitled"}</span>
        <span className="block truncate text-[12px] text-faint">{when}</span>
      </span>
      {event.celebrate && <Icon name="sparkles" size={14} className="text-accent" />}
    </button>
  );
}

// ---- the event dialog ---------------------------------------------------------------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}


function EventDialog(props: { id?: string | undefined; date: string; sticker?: string | undefined; spaceId: string | null; onClose: () => void; onOpenSettings: () => void }) {
  const { id, date, spaceId, onClose, onOpenSettings } = props;
  const toast = useToast();
  const [loaded, setLoaded] = useState<CalendarEvent | null | undefined>(id ? undefined : null);
  const [draft, setDraft] = useState<Omit<CalendarEvent, "id" | "spaceId">>({
    title: "",
    date,
    time: null,
    endTime: null,
    repeat: "none",
    until: null,
    reminders: [0],
    sticker: props.sticker ?? STICKERS[0]!.id,
    notes: "",
    celebrate: null,
  });
  const [custom, setCustom] = useState<{ n: string; unit: "minutes" | "hours" | "days" } | null>(null);

  useEffect(() => {
    if (!id) return;
    lumen.calendar.getEvent(id).then((e) => {
      setLoaded(e ?? null);
      if (e) setDraft(e);
    }, console.error);
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (id && loaded === undefined) return null;
  const builtin = loaded?.builtin;
  const readOnly = !!builtin || (loaded ? !loaded.editable : !spaceId);
  const allDay = draft.time === null;
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const options = allDay ? ALL_DAY_REMINDER_OPTIONS : REMINDER_OPTIONS;

  const save = async () => {
    try {
      const input = { ...draft, title: draft.title.trim() };
      if (id) await lumen.calendar.updateEvent(id, input);
      else if (spaceId) await lumen.calendar.createEvent(spaceId, input);
      onClose();
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), { tone: "error" });
    }
  };

  const addCustom = () => {
    if (!custom) return;
    const n = Math.max(0, Math.round(Number(custom.n)));
    if (!Number.isFinite(n)) return;
    const minutes = n * (custom.unit === "days" ? 1440 : custom.unit === "hours" ? 60 : 1);
    set({ reminders: [...new Set([...draft.reminders, minutes])].sort((a, b) => a - b) });
    setCustom(null);
  };

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "var(--scrim)" }} onMouseDown={onClose}>
      <ScenePerch />
      <div className="surface animate-pop max-h-[92vh] w-[min(520px,94vw)] overflow-y-auto rounded-[26px] p-6" onMouseDown={(e) => e.stopPropagation()}>
        {builtin ? (
          <BuiltinDay event={loaded!} date={date} onClose={onClose} onOpenSettings={onOpenSettings} />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <StickerBadge sticker={draft.sticker} size={40} />
              <input
                autoFocus={!id}
                value={draft.title}
                disabled={readOnly}
                onChange={(e) => set({ title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && !readOnly && void save()}
                placeholder={stickerOf(draft.sticker).label}
                className="min-w-0 flex-1 bg-transparent font-serif text-[22px] font-semibold placeholder:text-faint"
              />
            </div>

            {!readOnly && (
              <div className="mb-4 flex flex-wrap gap-1">
                {STICKERS.map((s) => (
                  <button
                    key={s.id}
                    title={s.label}
                    onClick={() => set({ sticker: s.id })}
                    className={`rounded-full p-0.5 transition-transform hover:scale-110 ${draft.sticker === s.id ? "bg-active" : ""}`}
                  >
                    <StickerBadge sticker={s.id} size={26} />
                  </button>
                ))}
              </div>
            )}

            <fieldset disabled={readOnly} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day">
                  <TextInput type="date" value={draft.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
                </Field>
                <Field label="Time">
                  <div className="flex items-center gap-2">
                    <Toggle checked={!allDay} onChange={(v) => set({ time: v ? "09:00" : null, endTime: null, reminders: v ? [10] : [0] })} label="Set a time" />
                    {allDay ? <span className="text-[13px] text-muted">All day</span> : <TextInput type="time" value={draft.time ?? ""} onChange={(e) => set({ time: e.target.value || "09:00" })} />}
                  </div>
                </Field>
              </div>
              {!allDay && (
                <Field label="Ends (optional)">
                  <TextInput type="time" value={draft.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value || null })} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Repeats">
                  <Select label="Repeats" value={draft.repeat} options={REPEAT_OPTIONS} onChange={(repeat: Repeat) => set({ repeat })} />
                </Field>
                {draft.repeat !== "none" && (
                  <Field label="Until (optional)">
                    <TextInput type="date" value={draft.until ?? ""} min={draft.date} onChange={(e) => set({ until: e.target.value || null })} />
                  </Field>
                )}
              </div>

              <Field label="Reminders">
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.reminders.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 rounded-lg bg-hover py-1 pr-1 pl-2.5 text-[12.5px]">
                      <Icon name="bell" size={13} className="text-muted" />
                      {reminderLabel(m, allDay)}
                      {!readOnly && (
                        <button className="grid h-5 w-5 place-items-center rounded-md text-faint hover:bg-active hover:text-fg" onClick={() => set({ reminders: draft.reminders.filter((x) => x !== m) })} aria-label="Remove reminder">
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {!draft.reminders.length && <span className="text-[13px] text-faint">No reminders</span>}
                  {!readOnly && !custom && (
                    <Select<number>
                      variant="link"
                      placeholder="+ Add reminder"
                      value={null}
                      options={[...options.filter((o) => !draft.reminders.includes(o.minutes)).map((o) => ({ value: o.minutes, label: o.label, icon: "bell" as const })), { value: -1, label: "Custom…", icon: "pencil" as const }]}
                      onChange={(m) => (m < 0 ? setCustom({ n: "30", unit: "minutes" }) : set({ reminders: [...new Set([...draft.reminders, m])].sort((a, b) => a - b) }))}
                    />
                  )}
                </div>
                {custom && (
                  <div className="mt-2 flex items-center gap-2">
                    <TextInput type="number" min={0} value={custom.n} onChange={(e) => setCustom({ ...custom, n: e.target.value })} className="w-24" />
                    <div className="w-36">
                      <Select
                        label="Unit"
                        value={custom.unit}
                        options={[
                          { value: "minutes", label: "minutes" },
                          { value: "hours", label: "hours" },
                          { value: "days", label: "days" },
                        ]}
                        onChange={(unit) => setCustom({ ...custom, unit })}
                      />
                    </div>
                    <span className="text-[13px] text-muted">before</span>
                    <Button onClick={addCustom}>Add</Button>
                  </div>
                )}
              </Field>

              <Field label="Celebrate on the day">
                <Select<string>
                  label="Celebrate on the day"
                  value={draft.celebrate ?? ""}
                  options={[{ value: "", label: "No, keep the usual sky" }, ...CELEBRATION_IDS.map((c) => ({ value: c, label: `${CELEBRATIONS[c].name} sky`, icon: CELEBRATIONS[c].icon }))]}
                  onChange={(v) => set({ celebrate: (v || null) as CelebrationId | null })}
                />
              </Field>

              <Field label="Notes">
                <textarea
                  value={draft.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-xl bg-hover px-3.5 py-2.5 text-[14px] transition-colors placeholder:text-faint focus:bg-active"
                  placeholder="Where, who, what to bring…"
                />
              </Field>
            </fieldset>

            <div className="mt-6 flex items-center gap-2">
              {id && !readOnly && (
                <Button
                  tone="danger"
                  icon="trash"
                  onClick={async () => {
                    await lumen.calendar.deleteEvent(id);
                    onClose();
                    toast("Event deleted", { icon: "trash" });
                  }}
                >
                  Delete
                </Button>
              )}
              {readOnly && <span className="text-[12.5px] text-faint">You can view this event, not change it.</span>}
              <span className="flex-1" />
              <Button onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
              {!readOnly && (
                <Button tone="primary" onClick={() => void save()}>
                  {id ? "Save" : "Add to calendar"}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BuiltinDay({ event, date, onClose, onOpenSettings }: { event: CalendarEvent; date: string; onClose: () => void; onOpenSettings: () => void }) {
  const { preview } = useAmbient();
  const birthday = event.builtin === "birthday" ? lumen.profile.birthday() : null;
  const age = birthday ? ageOn(birthday, date) : undefined;
  const c = event.celebrate ? CELEBRATIONS[event.celebrate] : undefined;
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <StickerBadge sticker={event.sticker} size={44} />
        <div>
          <h2 className="font-serif text-[22px] leading-tight font-semibold">{event.title}</h2>
          <div className="text-[13px] text-muted">
            {parseYmd(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {age !== undefined && age > 0 && ` · you turn ${age}`}
          </div>
        </div>
      </div>
      <p className="text-[14px] leading-relaxed text-muted">
        {event.builtin === "birthday"
          ? "Lumen celebrates with you all day: confetti and balloons in the sky, and a note in the morning."
          : `On the day the sky turns ${c?.name ?? "festive"}, and Lumen says hello in the morning.`}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {c && (
          <Button
            icon="sparkles"
            onClick={() => {
              preview(c.id);
              onClose();
            }}
          >
            Preview the sky
          </Button>
        )}
        <Button
          icon="settings"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          {event.builtin === "birthday" ? "Change birthday" : "Holiday settings"}
        </Button>
        <span className="flex-1" />
        <Button tone="primary" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}

// ---- asking for the birthday ---------------------------------------------------------------

/** Month and day pickers (+ optional year) that produce "MM-DD" or "YYYY-MM-DD". */
const splitBirthday = (value: string | null) =>
  value ? (value.length === 10 ? { y: value.slice(0, 4), m: value.slice(5, 7), d: value.slice(8) } : { y: "", m: value.slice(0, 2), d: value.slice(3) }) : { y: "", m: "", d: "" };

/** Emits null until both day and month are picked (a year is only used when it has 4 digits). */
export function BirthdayPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [parts, setParts] = useState(() => splitBirthday(value));
  useEffect(() => {
    if (value) setParts(splitBirthday(value));
  }, [value]);
  const emit = (p: typeof parts) => {
    setParts(p);
    onChange(p.m && p.d ? (p.y.length === 4 ? `${p.y}-${p.m}-${p.d}` : `${p.m}-${p.d}`) : null);
  };
  const months = Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1).padStart(2, "0"), label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }) }));
  const days = new Date(2000, Number(parts.m || 1), 0).getDate();
  return (
    <div className="grid grid-cols-[0.8fr_1.4fr_1fr] gap-2">
      <Select
        label="Day"
        placeholder="Day"
        value={parts.d || null}
        options={Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => ({ value: d, label: String(Number(d)) }))}
        onChange={(d) => emit({ ...parts, d })}
      />
      <Select
        label="Month"
        placeholder="Month"
        value={parts.m || null}
        options={months.map((m) => ({ value: m.v, label: m.label }))}
        onChange={(m) => {
          // 31 March -> February: the last day February has.
          const max = new Date(2000, Number(m), 0).getDate();
          emit({ ...parts, m, d: parts.d && Number(parts.d) > max ? String(max) : parts.d });
        }}
      />
      <TextInput placeholder="Year" inputMode="numeric" maxLength={4} value={parts.y} onChange={(e) => emit({ ...parts, y: e.target.value.replace(/\D/g, "") })} />
    </div>
  );
}

export function BirthdayPrompt({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<string | null>(null);
  const finish = async (action: "save" | "later" | "never") => {
    if (action === "save" && value) await lumen.profile.setBirthday(value).catch(() => {});
    else await lumen.profile.skipAsking(action === "never");
    onClose();
  };
  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "var(--scrim)" }}>
      <ScenePerch />
      <div className="surface animate-pop w-[min(440px,94vw)] rounded-[26px] p-6">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="cake" size={24} />
        </span>
        <h2 className="font-serif text-[22px] leading-tight font-semibold">When's your birthday?</h2>
        <p className="mt-1.5 mb-4 text-[13.5px] leading-relaxed text-muted">Lumen puts it on your calendar and celebrates with you on the day. The year is optional and only used to say how old you're turning.</p>
        <BirthdayPicker value={value} onChange={setValue} />
        <div className="mt-6 flex items-center gap-2">
          <button className="text-[12.5px] text-faint hover:text-muted" onClick={() => void finish("never")}>
            Don't ask again
          </button>
          <span className="flex-1" />
          <Button onClick={() => void finish("later")}>Not now</Button>
          <Button tone="primary" disabled={!value} onClick={() => void finish("save")}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

