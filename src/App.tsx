import { useEffect, useState } from "react";
import { finishBoot, lumen } from "./db/client";
import { account, createPage, getSpace, listSpaces, setCurrentSpace } from "./data/workspace";
import { useLive } from "./data/hooks";
import { AmbientProvider } from "./ambient/AmbientProvider";
import { Sky } from "./ambient/Sky";
import { SceneOverhead } from "./ambient/Scene";
import { AuthScreen } from "./components/Auth";
import { LoadingMark, WelcomeVideo } from "./components/Intro";
import { Sidebar } from "./components/Sidebar";
import { PageView } from "./components/PageView";
import { SearchDialog } from "./components/SearchDialog";
import { Settings, type SettingsSection } from "./components/Settings";
import { Icon } from "./components/Icon";
import { TitleBar } from "./components/TitleBar";
import { ToastProvider, useToast } from "./components/ui";
import { notify } from "./lib/notify";
import { startReminders } from "./lib/reminders";
import { BirthdayPrompt, CalendarView } from "./components/Calendar";
import { updates } from "./lib/updates";
import { warmSpellchecker } from "./lib/spell";

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "auth" } | { state: "ready" };

export default function App() {
  return (
    <>
      <Screens />
      <TitleBar />
    </>
  );
}

function Screens() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    lumen.start().then(
      ({ needsAuth }) => {
        // First launch on this device: the welcome animation plays before sign-in.
        if (needsAuth && !lumen.getSettings().welcomed) setWelcome(true);
        setBoot({ state: needsAuth ? "auth" : "ready" });
      },
      (e) => setBoot({ state: "error", message: String(e) }),
    );
  }, []);

  // Background sync once started: on an interval, after edits, and when the window regains
  // focus; plus a live socket while signed in, so other devices' edits arrive at once and
  // notifications pop up even while Lumen is minimized or behind other windows.
  useEffect(() => {
    const sync = lumen.sync;
    if (boot.state !== "ready" || !sync) return;
    const stop = sync.start();
    let closeLive: (() => void) | undefined;
    const updateLive = () => {
      const want = !!account.current;
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

  useEffect(() => (boot.state === "ready" ? updates.start() : undefined), [boot.state]);

  // Once the first screen has had a moment to load: save what it read as the next launch's
  // prefetch plan, and have Rust parse the spelling dictionary before a word needs checking.
  useEffect(() => {
    if (boot.state === "loading" || boot.state === "error") return;
    const t = window.setTimeout(() => {
      finishBoot();
      if (boot.state === "ready") warmSpellchecker();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [boot.state]);

  if (boot.state === "loading") return <LoadingMark />;
  if (welcome)
    return (
      <WelcomeVideo
        onDone={() => {
          setWelcome(false);
          void lumen.updateSettings({ welcomed: true });
        }}
      />
    );
  if (boot.state === "error")
    return <pre className="p-6 text-sm whitespace-pre-wrap text-red-500">Lumen could not start: {boot.message}</pre>;
  return (
    <AmbientProvider>
      <ToastProvider>
        <Sky />
        <SceneOverhead />
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
  const [pageId, setPageIdRaw] = useState<string | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [askBirthday, setAskBirthday] = useState(false);
  // Opening a page leaves the calendar.
  const setPageId = (id: string | null) => {
    setCalendar(false);
    setPageIdRaw(id);
  };
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const toast = useToast();

  // A different workspace (switched, or after signing in): start at its first page.
  useEffect(() => {
    if (space) setPageIdRaw(space.pages[0] ?? null);
  }, [space?.id]);

  // Coming back to Lumen without a birthday on file: ask once (later again if "Not now").
  useEffect(() => {
    const t = window.setTimeout(() => lumen.profile.shouldAsk() && setAskBirthday(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const offNotice = lumen.onNotice((n) => {
      void notify(n);
      const friendly = n.kind === "friend_request" || n.kind === "friend_accepted";
      toast(`${n.title}: ${n.body}`, {
        icon: friendly ? "user-plus" : "users",
        onClick: () => {
          if (n.notificationId) void lumen.inbox.markRead([n.notificationId]);
          if (friendly) setSettings("friends");
          else if (n.pageId) setPageId(n.pageId);
        },
      });
    });
    const offReminders = startReminders((n) => toast(`${n.title}: ${n.body}`, { icon: "bell-ring", onClick: () => setCalendar(true) }));
    const offRejected = lumen.onSyncRejected(() =>
      toast("Some changes weren't saved: you can only view that page now.", { tone: "error", icon: "lock" }),
    );
    let wasSignedIn = !!account.current;
    const offAccount = account.onChange(() => {
      if (wasSignedIn && !account.current && !account.skipped) toast("You were signed out. Sign in again to keep syncing.", { tone: "error", icon: "log-out" });
      wasSignedIn = !!account.current;
    });
    return () => {
      offNotice();
      offReminders();
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
          currentId={calendar ? null : pageId}
          onOpen={setPageId}
          calendarOpen={calendar}
          onCalendar={() => setCalendar(true)}
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
        {!sidebar && !pageId && !calendar && (
          <button
            onClick={() => setSidebar(true)}
            className="absolute top-2.5 left-3 z-20 grid h-8 w-8 place-items-center rounded-xl text-muted transition-colors hover:bg-hover hover:text-fg"
            title="Show sidebar (Ctrl \)"
          >
            <Icon name="panel-left" size={17} />
          </button>
        )}
        {calendar ? (
          <CalendarView space={space} role={role} onShowSidebar={sidebar ? undefined : () => setSidebar(true)} onOpenSettings={() => setSettings("calendar")} />
        ) : pageId ? (
          <PageView key={pageId} pageId={pageId} onOpen={setPageId} onSignIn={() => setSigningIn(true)} onShowSidebar={sidebar ? undefined : () => setSidebar(true)} />
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
      {askBirthday && <BirthdayPrompt onClose={() => setAskBirthday(false)} />}
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
