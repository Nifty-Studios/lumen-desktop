// Spellchecking runs in Rust (src-tauri/src/spell.rs): the dictionary is parsed on a
// background thread while Lumen starts and every check happens off this window's thread, so
// typing never waits on it. This module keeps the Rust side in step with the spelling
// setting and the person's dictionary, which syncs across devices.

import { invoke } from "@tauri-apps/api/core";
import { lumen } from "../db/client";

type Variant = "en-GB" | "en-US";
const listeners = new Set<() => void>();

/** American spelling where the device is set to the US, British everywhere else. */
const variant = (): Variant => {
  const s = lumen.getSettings().spelling;
  if (s !== "auto") return s;
  return /^[a-z]{2,3}-US(-|$)/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? "en-US" : "en-GB";
};

let personal: Promise<unknown> | undefined;
const sendPersonal = () => (personal = invoke("spell_personal", { words: lumen.dictionary.words() }).catch(() => {}));
/** The person's words reach Rust before the first check. */
const ready = () => personal ?? sendPersonal();

/** Parses the dictionary ahead of the first page (call once the app is up). */
export function warmSpellchecker() {
  if (!lumen.getSettings().spellcheck) return;
  void invoke("spell_warm", { variant: variant() }).catch(() => {});
  void ready();
}

/** The subset of `words` that aren't in the dictionary or the person's words. */
export async function misspelled(words: string[]): Promise<string[]> {
  if (!words.length) return [];
  await ready();
  return invoke<string[]>("spell_check", { variant: variant(), words });
}

/** Up to `max` corrections, best first. */
export async function suggest(word: string, max = 5): Promise<string[]> {
  return invoke<string[]>("spell_suggest", { variant: variant(), word, max });
}

lumen.dictionary.onChange(() => {
  void sendPersonal().then(() => listeners.forEach((l) => l()));
});
let lastSpelling = lumen.getSettings().spelling;
lumen.onSettings((s) => {
  if (s.spelling === lastSpelling) return;
  lastSpelling = s.spelling;
  listeners.forEach((l) => l());
});

/** The dictionary or the spelling changed: editors re-check their words. */
export function onDictionaryChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
