// The menu on a misspelled word (right-click): corrections, then "Add to dictionary".

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Misspelling } from "@lumen/shared/editor/blocknote";
import { lumen } from "../db/client";
import { spellchecker } from "../lib/spell";
import { Icon } from "./Icon";

export function SpellMenu({ misspelling, onReplace, onClose }: { misspelling: Misspelling; onReplace: (text: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>();
  const [pos, setPos] = useState<{ top: number; left: number }>();
  const { word, rect } = misspelling;

  useEffect(() => {
    let alive = true;
    spellchecker().then((s) => alive && setSuggestions(s.suggest(word)));
    return () => {
      alive = false;
    };
  }, [word]);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8));
    let top = rect.bottom + 6;
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, rect.top - box.height - 6);
    setPos({ top, left });
  }, [rect, suggestions]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const item = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:bg-hover";
  return createPortal(
    <div ref={ref} className="surface animate-pop fixed z-50 min-w-[200px] rounded-2xl p-1.5" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {!suggestions && <div className="px-2.5 py-1.5 text-[13px] text-muted">Looking for corrections…</div>}
      {suggestions?.length === 0 && <div className="px-2.5 py-1.5 text-[13px] text-muted">No suggestions</div>}
      {suggestions?.map((s) => (
        <button
          key={s}
          className={`${item} font-medium`}
          onClick={() => {
            onReplace(s);
            onClose();
          }}
        >
          {s}
        </button>
      ))}
      <div className="h-1" />
      <button
        className={item}
        onClick={() => {
          void lumen.dictionary.add(word);
          onClose();
        }}
      >
        <Icon name="book-a" size={15} className="text-muted" />
        <span className="flex-1">Add “{word}” to dictionary</span>
      </button>
    </div>,
    document.body,
  );
}
