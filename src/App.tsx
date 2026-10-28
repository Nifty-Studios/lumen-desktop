import { useEffect, useState } from "react";
import type { Space } from "@lumen/shared/schema/client";
import { lumen } from "./db/client";
import { createPage, getSpace } from "./data/workspace";
import { useLive } from "./data/hooks";
import { Sidebar } from "./components/Sidebar";
import { PageView } from "./components/PageView";
import { SearchDialog } from "./components/SearchDialog";

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; space: Space };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });

  useEffect(() => {
    (async () => {
      setBoot({ state: "ready", space: await lumen.start() });
    })().catch((e) => setBoot({ state: "error", message: String(e) }));
  }, []);

  if (boot.state === "loading") return null;
  if (boot.state === "error")
    return <pre className="p-6 text-sm text-red-600 whitespace-pre-wrap">Lumen could not start: {boot.message}</pre>;
  return <Workspace initial={boot.space} />;
}

function Workspace({ initial }: { initial: Space }) {
  const space = useLive(async () => (await getSpace()) ?? initial, []) ?? initial;
  const [pageId, setPageId] = useState<string | null>(initial.pages[0] ?? null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") {
        e.preventDefault();
        setSearching(true);
      } else if (key === "n") {
        e.preventDefault();
        createPage(space, null).then(setPageId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [space]);

  return (
    <div className="flex h-full">
      <Sidebar space={space} currentId={pageId} onOpen={setPageId} onSearch={() => setSearching(true)} />
      <main className="flex-1 overflow-y-auto">
        {pageId ? (
          <PageView key={pageId} pageId={pageId} />
        ) : (
          <div className="grid h-full place-items-center text-muted">No page selected</div>
        )}
      </main>
      {searching && (
        <SearchDialog
          onClose={() => setSearching(false)}
          onOpen={(id) => {
            setPageId(id);
            setSearching(false);
          }}
        />
      )}
    </div>
  );
}
