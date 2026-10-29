// The "/" menu: grouped, ordered, with an icon tile, a short description and the
// markdown shortcut for each block.

import { useEffect, useRef } from "react";
import type { SuggestionMenuProps } from "@blocknote/react";
import type { SlashItem } from "@lumen/shared/editor";
import { Icon } from "./Icon";

export function SlashMenu({ items, selectedIndex, onItemClick }: SuggestionMenuProps<SlashItem>) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!items.length)
    return (
      <div className="surface animate-pop w-72 rounded-2xl px-4 py-3 text-[13px] text-muted">
        No blocks match. Press <span className="text-fg">Esc</span> to keep typing.
      </div>
    );

  let group = "";
  return (
    <div ref={list} className="surface animate-pop max-h-[min(400px,60vh)] w-[312px] overflow-y-auto rounded-2xl p-1.5" onMouseDown={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        const header = item.group !== group ? item.group : null;
        group = item.group;
        const selected = i === selectedIndex;
        return (
          <div key={item.key}>
            {header && <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">{header}</div>}
            <button
              data-index={i}
              onClick={() => onItemClick?.(item)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors ${selected ? "bg-hover" : ""}`}
            >
              <span
                className={`grid h-9 w-9 flex-none place-items-center rounded-[10px] transition-colors ${
                  selected ? "bg-accent text-accent-fg" : "bg-hover text-muted"
                }`}
              >
                <Icon name={item.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-tight">{item.title}</span>
                <span className="block truncate text-[12px] text-muted">{item.subtext}</span>
              </span>
              {item.shortcut && <span className="font-mono text-[11px] text-faint">{item.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
