// App updates: Lumen checks the release bucket now and then (latest.json, signed builds only),
// tells the person when a new version is out, downloads it when they say so, and installs it
// (restarting Lumen) once they agree.

import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { playChime } from "./notify";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; progress: number }
  | { phase: "ready"; version: string }
  | { phase: "installing"; version: string }
  | { phase: "error"; version: string; message: string; stage: "download" | "install" };

const CHECK_EVERY = 6 * 60 * 60_000;

/** The reason, short enough for the card. */
const errorText = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, "").slice(0, 160);

let state: UpdateState = { phase: "idle" };
let pending: Update | null = null;
/** Versions the person said "Later" to stay quiet until the next launch. */
const snoozed = new Set<string>();
const listeners = new Set<(s: UpdateState) => void>();

function set(next: UpdateState) {
  state = next;
  for (const l of listeners) l(state);
}

async function announce(version: string) {
  playChime();
  try {
    if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
    sendNotification({ title: "A new Lumen is ready", body: `Version ${version} is available. Open Lumen to update.` });
  } catch {
    // The card in the sidebar still shows it.
  }
}

async function checkNow() {
  if (state.phase !== "idle" && state.phase !== "available") return;
  try {
    const update = await check();
    if (!update || snoozed.has(update.version)) return;
    const isNew = state.phase !== "available" || state.version !== update.version;
    pending = update;
    set({ phase: "available", version: update.version });
    if (isNew) void announce(update.version);
  } catch {
    // Offline or the bucket is unreachable: try again later.
  }
}

export const updates = {
  /** Checks now and every few hours. Returns a stop function. */
  start() {
    if (import.meta.env.DEV) return () => {};
    void checkNow();
    const t = window.setInterval(checkNow, CHECK_EVERY);
    return () => window.clearInterval(t);
  },
  async download() {
    if (!pending || state.phase !== "available") return;
    const version = pending.version;
    let total = 0;
    let done = 0;
    set({ phase: "downloading", version, progress: 0 });
    try {
      await pending.download((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          if (total) set({ phase: "downloading", version, progress: done / total });
        }
      });
      set({ phase: "ready", version });
    } catch (e) {
      set({ phase: "error", version, message: errorText(e), stage: "download" });
    }
  },
  async install() {
    if (!pending || state.phase !== "ready") return;
    set({ phase: "installing", version: pending.version });
    try {
      // On Windows the installer closes Lumen, updates it and opens it again.
      await pending.install();
      await relaunch();
    } catch (e) {
      console.error("update install failed", e);
      // The downloaded installer is used up: "Try again" checks and downloads afresh.
      set({ phase: "error", version: pending.version, message: errorText(e), stage: "install" });
      pending = null;
    }
  },
  later() {
    if (state.phase === "idle") return;
    // Asked again on the next launch.
    snoozed.add(state.version);
    pending = null;
    set({ phase: "idle" });
  },
  retry() {
    set({ phase: "idle" });
    void checkNow();
  },
};

export function useUpdate(): UpdateState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}
