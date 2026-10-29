// Notices (a page or workspace shared with you): the chime, and a Windows notification when
// Lumen isn't the window in front. The in-app toast is shown by the caller.

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Notice } from "@lumen/shared/client";

let chime: HTMLAudioElement | undefined;

export function playChime() {
  chime ??= new Audio("/sounds/notify.wav");
  chime.currentTime = 0;
  chime.volume = 0.7;
  void chime.play().catch(() => {});
}

export async function notify(notice: Notice) {
  playChime();
  if (document.hasFocus()) return;
  try {
    if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
    sendNotification({ title: notice.title, body: notice.body });
  } catch {
    // Notifications are a nicety; the toast still shows when they come back.
  }
}
