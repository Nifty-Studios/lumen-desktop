// One spellchecker for the whole window (a dictionary takes about half a second to load), kept
// in step with the spelling setting and the person's dictionary, which syncs across devices.

import { defaultSpelling, loadSpellchecker, type Spellchecker, type SpellingVariant } from "@lumen/shared/spell";
import { lumen } from "../db/client";

const listeners = new Set<() => void>();
let current: { variant: SpellingVariant; ready: Promise<Spellchecker> } | undefined;

const variant = (): SpellingVariant => {
  const s = lumen.getSettings().spelling;
  return s === "auto" ? defaultSpelling() : s;
};

export function spellchecker() {
  const v = variant();
  if (current?.variant !== v)
    current = {
      variant: v,
      ready: loadSpellchecker(v).then((s) => {
        s.setPersonal(lumen.dictionary.words());
        return s;
      }),
    };
  return current.ready;
}

lumen.dictionary.onChange((words) => {
  void current?.ready.then((s) => {
    s.setPersonal(words);
    listeners.forEach((l) => l());
  });
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
