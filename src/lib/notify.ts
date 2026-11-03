// Notices (shares, friend requests, reminders): the chime, and a Windows notification when
// Lumen isn't the window in front (minimized, behind other windows, or on another desktop).
// The in-app toast is shown by the caller.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Notice } from "@lumen/shared/client";

let chime: HTMLAudioElement | undefined;

export function playChime() {
  chime ??= new Audio("/sounds/notify.wav");
  chime.currentTime = 0;
  chime.volume = 0.7;
  void chime.play().catch(() => {});
}

/** Is Lumen the focused, visible window? (document.hasFocus misses minimized windows on WebView2.) */
export async function inFront(): Promise<boolean> {
  try {
    const win = getCurrentWindow();
    const [focused, minimized, visible] = await Promise.all([win.isFocused(), win.isMinimized(), win.isVisible()]);
    return focused && !minimized && visible && document.visibilityState === "visible";
  } catch {
    return document.hasFocus();
  }
}

export async function systemNotification(title: string, body: string) {
  try {
    if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
    sendNotification({ title, body });
  } catch {
    // Notifications are a nicety; the toast still shows when they come back.
  }
}

/** `system: false` when Windows already shows it (a scheduled reminder). */
export async function notify(notice: Notice, { system = true } = {}) {
  playChime();
  if (system && !(await inFront())) await systemNotification(notice.title, notice.body);
}
