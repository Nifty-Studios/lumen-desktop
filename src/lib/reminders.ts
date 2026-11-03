// Calendar reminders on Windows, two ways at once:
// - Windows schedules the next two weeks of them (src-tauri/src/reminders.rs), so they arrive
//   even when Lumen is closed. Rescheduled whenever events or settings change.
// - While Lumen runs it also tells each one itself: the chime and a toast in the window. On a
//   dev build, where Windows can't schedule, it shows the Windows notification too.

import { invoke } from "@tauri-apps/api/core";
import type { Notice } from "@lumen/shared/client";
import type { Reminder } from "@lumen/shared/calendar";
import { lumen } from "../db/client";
import { timeParts } from "../ambient/Clock";
import { notify } from "./notify";

const AHEAD = 14 * 86_400_000;
/** A reminder this late (the PC was asleep) is still worth telling. */
const LATE_OK = 2 * 60 * 60_000;

const formatTime = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  const { time, period } = timeParts(d, lumen.getSettings().clock);
  return period ? `${time} ${period}` : time;
};

let windowsSchedules = false;
/** What Windows has scheduled now, to skip identical reschedules (any edit to a page triggers one). */
let scheduled = "";

async function reschedule() {
  const now = Date.now();
  const reminders = (await lumen.calendar.reminders(now, now + AHEAD, formatTime)).map((r) => ({ at: r.at, title: r.title, body: r.body }));
  const key = JSON.stringify(reminders);
  if (key === scheduled) return;
  try {
    await invoke<number>("schedule_reminders", { reminders });
    windowsSchedules = true;
    scheduled = key;
  } catch {
    windowsSchedules = false;
  }
}

export const reminderNotice = (r: Reminder): Notice => ({ title: r.title, body: r.body, kind: "reminder", eventId: r.eventId });

/** Starts both; `onDue` shows the in-app toast. Returns a stop function. */
export function startReminders(onDue: (notice: Notice) => void) {
  let last = Date.now();
  let queued: number | undefined;
  const soon = () => {
    window.clearTimeout(queued);
    queued = window.setTimeout(() => void reschedule().catch(console.error), 1500);
  };

  const tick = async () => {
    const now = Date.now();
    const from = Math.max(last, now - LATE_OK);
    last = now;
    for (const r of await lumen.calendar.reminders(from, now, formatTime)) {
      const notice = reminderNotice(r);
      void notify(notice, { system: !windowsSchedules });
      onDue(notice);
    }
  };

  void reschedule().catch(console.error);
  const timer = window.setInterval(() => void tick().catch(console.error), 20_000);
  const daily = window.setInterval(soon, 6 * 60 * 60_000);
  const offData = lumen.onChange((changed) => {
    if (changed.some((c) => c.table === "block")) soon();
  });
  const offSettings = lumen.onSettings(soon);
  const offProfile = lumen.profile.onChange(soon);
  return () => {
    window.clearInterval(timer);
    window.clearInterval(daily);
    window.clearTimeout(queued);
    offData();
    offSettings();
    offProfile();
  };
}
