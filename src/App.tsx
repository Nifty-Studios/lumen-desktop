import { useEffect, useState } from "react";
import type { Space } from "@lumen/shared/schema/client";
import { lumen } from "./db/client";
import { createPage, getSpace } from "./data/workspace";
import { useLive } from "./data/hooks";
import { AmbientProvider } from "./ambient/AmbientProvider";
import { Sky } from "./ambient/Sky";
import { Sidebar } from "./components/Sidebar";
import { PageView } from "./components/PageView";
import { SearchDialog } from "./components/SearchDialog";
import { Settings, type SettingsSection } from "./components/Settings";
import { Icon } from "./components/Icon";
import { ToastProvider } from "./components/ui";

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; space: Space };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });

  useEffect(() => {
    (async () => {
      setBoot({ state: "ready", space: await lumen.start() });
    })().catch((e) => setBoot({ state: "error", message: String(e) }));
  }, []);

  // Background sync once started: on an interval, after edits, and when the window regains focus.
  useEffect(() => {
    if (boot.state !== "ready" || !lumen.sync) return;
    const stop = lumen.sync.start();
    const onFocus = () => void lumen.sync?.sync().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
    };
  }, [boot.state]);

  if (boot.state === "loading") return null;
  if (boot.state === "error")
    return <pre className="p-6 text-sm whitespace-pre-wrap text-red-500">Lumen could not start: {boot.message}</pre>;
  return (
    <AmbientProvider>
      <ToastProvider>
        <Sky />
        <Workspace initial={boot.space} />
      </ToastProvider>
    </AmbientProvider>
  );
}

function Workspace({ initial }: { initial: Space }) {
  const space = useLive(async () => (await getSpace()) ?? initial, []) ?? initial;
  const [pageId, setPageId] = useState<string | null>(initial.pages[0] ?? null);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [sidebar, setSidebar] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") setSearching(true);
      else if (key === "n") createPage(space, null).then(setPageId);
      else if (key === ",") setSettings("appearance");
      else if (key === "\\") setSidebar((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [space]);

  return (
    <div className="relative z-10 flex h-full gap-3 px-3.5 pt-14 pb-3.5">
      {sidebar && (
        <Sidebar
          space={space}
          currentId={pageId}
          onOpen={setPageId}
          onSearch={() => setSearching(true)}
          onSettings={(s) => setSettings((s as SettingsSection) ?? "appearance")}
          onCollapse={() => setSidebar(false)}
        />
      )}
      <main className="sheet min-w-0 flex-1 overflow-hidden rounded-[22px]">
        {!sidebar && (
          <button
            onClick={() => setSidebar(true)}
            className="absolute top-2.5 left-3 z-20 grid h-8 w-8 place-items-center rounded-xl text-muted transition-colors hover:bg-hover hover:text-fg"
            title="Show sidebar (Ctrl \)"
          >
            <Icon name="panel-left" size={17} />
          </button>
        )}
        {pageId ? (
          <PageView key={pageId} pageId={pageId} onOpen={setPageId} />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <button className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-hover" onClick={() => createPage(space, null).then(setPageId)}>
              <Icon name="plus" size={16} /> New page
            </button>
          </div>
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
      {settings && <Settings initial={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
