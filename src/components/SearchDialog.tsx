import { useEffect, useState } from "react";
import { getBlock, pageTitle, search, type SearchHit } from "../data/workspace";

interface Result extends SearchHit {
  title: string;
}

export function SearchDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (pageId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let current = true;
    const t = window.setTimeout(async () => {
      const hits = await search(query);
      const withTitles = await Promise.all(
        hits.map(async (h) => ({ ...h, title: pageTitle((await getBlock(h.pageId)) ?? { properties: {} }) })),
      );
      if (current) {
        setResults(withTitles);
        setSelected(0);
      }
    }, 80);
    return () => {
      current = false;
      window.clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 pt-[15vh]" onMouseDown={onClose}>
      <div
        className="h-fit w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-border bg-bg shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder="Search pages…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-base outline-none"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, results.length - 1));
            else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter" && results[selected]) onOpen(results[selected].pageId);
            else return;
            e.preventDefault();
          }}
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1 text-sm">
          {query && results.length === 0 && <li className="px-4 py-3 text-muted">No results</li>}
          {results.map((r, i) => (
            <li
              key={r.pageId}
              className={`cursor-pointer px-4 py-2 ${i === selected ? "bg-hover" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => onOpen(r.pageId)}
            >
              <div className="font-medium">{r.title}</div>
              {r.snippet !== r.title && <div className="truncate text-xs text-muted">{r.snippet}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
