import { useEffect, useState } from "react";
import type { Block } from "@lumen/shared/schema/client";
import { iconColor, resolveIcon } from "@lumen/shared/icons";
import { getBlock, pageTitle, search } from "../data/workspace";
import { useAmbient } from "../ambient/AmbientProvider";
import { Icon } from "./Icon";
import { Kbd } from "./ui";

interface Result {
  page: Block;
  snippet: string;
}

export function SearchDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (pageId: string) => void }) {
  const { theme } = useAmbient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let current = true;
    const t = window.setTimeout(async () => {
      const hits = await search(query);
      const found = await Promise.all(hits.map(async (h) => ({ page: await getBlock(h.pageId), snippet: h.snippet })));
      if (current) {
        setResults(found.filter((r): r is Result => !!r.page));
        setSelected(0);
      }
    }, 80);
    return () => {
      current = false;
      window.clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex justify-center pt-[14vh]" style={{ background: "var(--scrim)" }} onMouseDown={onClose}>
      <div className="surface animate-pop h-fit w-[600px] max-w-[90vw] overflow-hidden rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5">
          <Icon name="search" size={18} className="text-muted" />
          <input
            autoFocus
            value={query}
            placeholder="Search every page"
            className="flex-1 bg-transparent py-4 text-[16px] placeholder:text-faint"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, results.length - 1));
              else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
              else if (e.key === "Enter" && results[selected]) onOpen(results[selected].page.id);
              else return;
              e.preventDefault();
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        {(results.length > 0 || query) && (
          <ul className="max-h-[50vh] overflow-y-auto px-2 pb-2">
            {query && results.length === 0 && <li className="px-4 py-6 text-center text-[13.5px] text-muted">Nothing found for “{query}”</li>}
            {results.map((r, i) => {
              const icon = resolveIcon(r.page.format.icon);
              const title = pageTitle(r.page);
              return (
                <li
                  key={r.page.id}
                  className={`flex cursor-default items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${i === selected ? "bg-hover" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => onOpen(r.page.id)}
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-hover">
                    <Icon name={icon.name} size={17} color={iconColor(icon.color, theme.dark)} className="text-muted" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{title}</span>
                    {r.snippet !== title && <span className="block truncate text-[12.5px] text-muted">{r.snippet}</span>}
                  </span>
                  {i === selected && <Icon name="corner-down-left" size={15} className="text-faint" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
