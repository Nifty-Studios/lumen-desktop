// Saving and opening files from the webview: a native save dialog plus a raw-bytes
// command for writing (src-tauri/src/device.rs), and a plain file input for reading.

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** Asks where to save, then writes the bytes. Returns the path, or null if cancelled. */
export async function saveBytes(defaultName: string, bytes: Uint8Array): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "Zip archive", extensions: ["zip"] }] });
  if (!path) return null;
  await invoke("save_file", bytes, { headers: { "x-path": encodeURIComponent(path) } });
  return path;
}

/** Opens the system file picker. Resolves null if the user cancels. */
export function pickFile(accept = ".zip"): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
