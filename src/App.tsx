import { useEffect, useState } from "react";
import { lumen } from "./db/client";
import { account, createPage, getSpace, listSpaces, setCurrentSpace } from "./data/workspace";
import { useLive } from "./data/hooks";
import { AmbientProvider } from "./ambient/AmbientProvider";
import { Sky } from "./ambient/Sky";
import { AuthScreen } from "./components/Auth";
import { Sidebar } from "./components/Sidebar";
import { PageView } from "./components/PageView";
import { SearchDialog } from "./components/SearchDialog";
import { Settings, type SettingsSection } from "./components/Settings";
import { Icon } from "./components/Icon";
import { ToastProvider, useToast } from "./components/ui";

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "auth" } | { state: "ready" };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });

  useEffect(() => {
    lumen.start().then(
      ({ needsAuth }) => setBoot({ state: needsAuth ? "auth" : "ready" }),
      (e) => setBoot({ state: "error", message: String(e) }),
    );
  }, []);

  // Background sync once started: on an interval, after edits, and when the window regains
  // focus; plus a live socket while the window is visible, so other devices' edits arrive at once.
  useEffect(() => {
    const sync = lumen.sync;
    if (boot.state !== "ready" || !sync) return;
    const stop = sync.start();
    let closeLive: (() => void) | undefined;
    const updateLive = () => {
      const want = document.visibilityState === "visible" && !!account.current;
      if (want && !closeLive) closeLive = sync.live();
      if (!want && closeLive) {
        closeLive();
        closeLive = undefined;
      }
    };
    updateLive();
    const onFocus = () => void sync.sync().catch(() => {});
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", updateLive);
    const offAccount = account.onChange(updateLive);
    return () => {
      stop();
      closeLive?.();
      offAccount();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", updateLive);
    };
  }, [boot.state]);

  if (boot.state === "loading") return null;
  if (boot.state === "error")
    return <pre className="p-6 text-sm whitespace-pre-wrap text-red-500">Lumen could not start: {boot.message}</pre>;
  return (
    <AmbientProvider>
      <ToastProvider>
        <Sky />
        {boot.state === "auth" ? (
          <AuthScreen
            onDone={() => setBoot({ state: "ready" })}
            onLater={async () => {
              await lumen.continueSignedOut();
              setBoot({ state: "ready" });
            }}
          />
        ) : (
          <Workspace />
        )}
      </ToastProvider>
    </AmbientProvider>
  );
}

function Workspace() {
  // Bumped when the workspace is switched (a device-local choice, not a data change).
  const [picked, setPicked] = useState(0);
  const space = useLive(getSpace, [picked]);
  const role = useLive(async () => (await listSpaces()).find((s) => s.space.id === space?.id)?.role, [space?.id]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const toast = useToast();

  // A different workspace (switched, or after signing in): start at its first page.
  useEffect(() => {
    if (space) setPageId(space.pages[0] ?? null);
  }, [space?.id]);

  useEffect(() => {
    const offRejected = lumen.onSyncRejected(() =>
      toast("Some changes weren't saved: you can only view that page now.", { tone: "error", icon: "lock" }),
    );
    let wasSignedIn = !!account.current;
    const offAccount = account.onChange(() => {
      if (wasSignedIn && !account.current && !account.skipped) toast("You were signed out. Sign in again to keep syncing.", { tone: "error", icon: "log-out" });
      wasSignedIn = !!account.current;
    });
    return () => {
      offRejected();
      offAccount();
    };
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") setSearching(true);
      else if (key === "n") space && role !== "viewer" && createPage(space, null).then(setPageId);
      else if (key === ",") setSettings("appearance");
      else if (key === "\\") setSidebar((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [space, role]);

  if (!space) return null;

  return (
    <div className="relative z-10 flex h-full gap-3 px-3.5 pt-14 pb-3.5">
      {sidebar && (
        <Sidebar
          space={space}
          role={role}
          currentId={pageId}
          onOpen={setPageId}
          onSearch={() => setSearching(true)}
          onSettings={(s) => setSettings((s as SettingsSection) ?? "appearance")}
          onCollapse={() => setSidebar(false)}
          onSwitchSpace={async (id) => {
            await setCurrentSpace(id);
            setPicked((n) => n + 1);
          }}
          onSignIn={() => setSigningIn(true)}
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
          <PageView key={pageId} pageId={pageId} onOpen={setPageId} onSignIn={() => setSigningIn(true)} />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            {role !== "viewer" && (
              <button className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-hover" onClick={() => createPage(space, null).then(setPageId)}>
                <Icon name="plus" size={16} /> New page
              </button>
            )}
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
      {settings && (
        <Settings
          initial={settings}
          onClose={() => setSettings(null)}
          onSignIn={() => {
            setSettings(null);
            setSigningIn(true);
          }}
          onSignedOut={() => {
            setSettings(null);
            toast("Signed out. Your notes stay on this device, without syncing.", { icon: "log-out" });
          }}
        />
      )}
      {signingIn && (
        <AuthScreen
          onClose={() => setSigningIn(false)}
          onDone={() => {
            setSigningIn(false);
            setPicked((n) => n + 1);
            toast("Signed in. Your notes are syncing.", { icon: "cloud" });
          }}
        />
      )}
    </div>
  );
}
