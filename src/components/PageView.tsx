import { useEffect, useRef, useState } from "react";
import type { Block } from "@lumen/shared/schema/client";
import { iconColor, resolveIcon } from "@lumen/shared/icons";
import type { SyncStatus } from "@lumen/shared/client";
import type { PageSession } from "../data/workspace";
import { childPages, createPage, getBlock, getSpace, openPage, pagePath, pageTitle, renamePage, setPageAlive, setPageIcon } from "../data/workspace";
import { useLive } from "../data/hooks";
import { lumen } from "../db/client";
import { useAmbient } from "../ambient/AmbientProvider";
import { Editor, type LumenEditor } from "./Editor";
import { Icon } from "./Icon";
import { IconPicker } from "./IconPicker";
import { MenuItem, Popover } from "./ui";

interface Props {
  pageId: string;
  onOpen: (id: string) => void;
}

/** Put the caret at the end of the page, adding an empty line if the last block has text. */
function focusEnd(editor: LumenEditor) {
  const blocks = editor.document;
  const last = blocks[blocks.length - 1];
  const emptyParagraph =
    last && last.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0 && last.children.length === 0;
  const target = last && !emptyParagraph ? editor.insertBlocks([{ type: "paragraph" }], last, "after")[0]?.id : last?.id;
  if (target) editor.setTextCursorPosition(target, "end");
  editor.focus();
}

export function PageView({ pageId, onOpen }: Props) {
  const page = useLive(() => getBlock(pageId), [pageId]);
  const children = useLive(() => childPages(pageId), [pageId]) ?? [];
  const path = useLive(() => pagePath(pageId), [pageId]) ?? [];
  // The editor's blocks load once per page; after that the editor owns the document.
  const [session, setSession] = useState<PageSession>();
  const [editor, setEditor] = useState<LumenEditor>();
  const [words, setWords] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    openPage(pageId).then(setSession, console.error);
  }, [pageId]);

  if (!page || !session) return null;

  return (
    <div ref={scroller} className="h-full overflow-y-auto" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
      <TopBar page={page} path={path} scrolled={scrolled} onOpen={onOpen} />
      {!page.alive && (
        <div className="mx-auto mt-2 flex max-w-[720px] items-center gap-3 rounded-2xl bg-hover px-4 py-3 text-[13.5px]">
          <Icon name="trash" size={16} className="text-muted" />
          <span className="flex-1">This page is in the trash.</span>
          <button className="rounded-lg px-2.5 py-1 font-medium text-accent hover:bg-hover" onClick={() => setPageAlive(page.id, true)}>
            Restore
          </button>
        </div>
      )}
      <div
        className="mx-auto max-w-[760px] px-16 pt-10"
        onMouseDown={(e) => {
          // Clicking the empty space around the text starts typing at the end.
          if (e.target === e.currentTarget && editor) {
            e.preventDefault();
            focusEnd(editor);
          }
        }}
      >
        <Header page={page} words={words} childCount={children.length} onEnter={() => editor?.focus()} />
        <Editor page={page} session={session} onReady={setEditor} onWords={setWords} />
        {children.length > 0 && <PagesInside pages={children} onOpen={onOpen} />}
      </div>
      <div
        className="min-h-[42vh] cursor-text"
        onMouseDown={(e) => {
          if (!editor) return;
          e.preventDefault();
          focusEnd(editor);
        }}
      />
    </div>
  );
}

// ---- top bar ----------------------------------------------------------------------------

function useSyncStatus(): SyncStatus | undefined {
  const [status, setStatus] = useState(lumen.sync?.current);
  useEffect(() => lumen.sync?.onStatus(setStatus), []);
  return status;
}

function TopBar({ page, path, scrolled, onOpen }: { page: Block; path: Block[]; scrolled: boolean; onOpen: (id: string) => void }) {
  const status = useSyncStatus();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const crumbs = [...path, page];
  const sync = !lumen.sync
    ? { text: "On this device", dot: "bg-faint" }
    : status?.state === "syncing"
      ? { text: "Syncing", dot: "bg-accent animate-pulse" }
      : status?.state === "offline"
        ? { text: "Offline · saved here", dot: "bg-faint" }
        : status?.state === "error"
          ? { text: "Sync paused", dot: "bg-danger" }
          : { text: "Synced", dot: "bg-accent" };

  return (
    <div
      className={`sticky top-0 z-10 flex h-12 items-center gap-2 px-4 transition-[background,box-shadow] duration-300 ${
        scrolled ? "bg-glass shadow-[0_10px_30px_-18px_var(--shadow)] backdrop-blur-xl" : ""
      }`}
    >
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px]">
        {crumbs.map((p, i) => {
          const icon = resolveIcon(p.format.icon);
          const last = i === crumbs.length - 1;
          return (
            <span key={p.id} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <Icon name="chevron-right" size={13} className="text-faint" />}
              <button
                onClick={() => !last && onOpen(p.id)}
                className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors ${last ? "text-fg" : "text-muted hover:bg-hover"}`}
              >
                <Icon name={icon.name} size={14} />
                <span className="max-w-[180px] truncate">{pageTitle(p)}</span>
              </button>
            </span>
          );
        })}
      </nav>
      <span className="flex items-center gap-2 px-2 text-[12px] text-muted" title={status?.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : undefined}>
        <span className={`h-1.5 w-1.5 rounded-full ${sync.dot}`} />
        {sync.text}
      </span>
      <button
        onClick={(e) => setMenu(menu ? null : e.currentTarget)}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg"
        aria-label="Page actions"
      >
        <Icon name="ellipsis" size={18} />
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="end" width={220}>
          <MenuItem
            icon="plus"
            label="Add a page inside"
            onClick={async () => {
              setMenu(null);
              const space = await getSpace();
              if (space) onOpen(await createPage(space, page.id));
            }}
          />
          {page.alive ? (
            <MenuItem
              icon="trash"
              label="Move to trash"
              danger
              onClick={() => {
                setMenu(null);
                setPageAlive(page.id, false);
              }}
            />
          ) : (
            <MenuItem icon="archive-restore" label="Restore" onClick={() => (setMenu(null), setPageAlive(page.id, true))} />
          )}
        </Popover>
      )}
    </div>
  );
}

// ---- header -----------------------------------------------------------------------------

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_557_600],
  ["month", 2_629_800],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

const ago = (ms: number) => {
  const s = (ms - Date.now()) / 1000;
  if (Math.abs(s) < 45) return "just now";
  const [unit, size] = UNITS.find(([, size]) => Math.abs(s) >= size) ?? ["minute", 60];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(s / size), unit);
};

function Header({ page, words, childCount, onEnter }: { page: Block; words: number; childCount: number; onEnter: () => void }) {
  const { theme } = useAmbient();
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const icon = page.format.icon ? resolveIcon(page.format.icon) : null;
  const tint = icon ? iconColor(icon.color, theme.dark) : undefined;

  return (
    <div className="group/header mb-3">
      {icon ? (
        <button
          onClick={(e) => setPicker(e.currentTarget)}
          className="mb-4 grid h-16 w-16 place-items-center rounded-[20px] transition-transform hover:scale-105"
          style={{ background: tint ? `color-mix(in srgb, ${tint} 16%, transparent)` : "var(--hover)", color: tint ?? "var(--text)" }}
          title="Change icon"
        >
          <Icon name={icon.name} size={32} strokeWidth={1.6} />
        </button>
      ) : (
        <button
          onClick={(e) => setPicker(e.currentTarget)}
          className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-faint opacity-0 transition-opacity group-hover/header:opacity-100 hover:bg-hover hover:text-muted"
        >
          <Icon name="sparkles" size={14} /> Add icon
        </button>
      )}
      {picker && (
        <IconPicker
          anchor={picker}
          current={icon}
          onClose={() => setPicker(null)}
          onPick={(next) => {
            setPageIcon(page.id, next);
            setPicker(null);
          }}
        />
      )}
      <Title page={page} onEnter={onEnter} />
      <div className="mt-2 mb-6 flex items-center gap-2 text-[12.5px] text-faint">
        <span>Edited {ago(page.last_edited_time)}</span>
        <span>·</span>
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
        {childCount > 0 && (
          <>
            <span>·</span>
            <span>
              {childCount} {childCount === 1 ? "page" : "pages"} inside
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Title({ page, onEnter }: { page: Block; onEnter: () => void }) {
  const initial = pageTitle(page) === "Untitled" ? "" : pageTitle(page);
  const [value, setValue] = useState(initial);
  const timer = useRef<number>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!initial) ref.current?.focus();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Untitled"
      className="font-serif block w-full resize-none overflow-hidden bg-transparent text-[42px] leading-[1.15] font-semibold tracking-[-0.015em] placeholder:text-faint"
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, "");
        setValue(next);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => renamePage(page.id, next), 300);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

// ---- sub-pages --------------------------------------------------------------------------

function PagesInside({ pages, onOpen }: { pages: Block[]; onOpen: (id: string) => void }) {
  const { theme } = useAmbient();
  return (
    <div className="mt-8">
      <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Pages inside</div>
      <div className="grid grid-cols-2 gap-2">
        {pages.map((p) => {
          const icon = resolveIcon(p.format.icon);
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="flex items-center gap-3 rounded-2xl bg-hover px-3 py-2.5 text-left transition-colors hover:bg-active"
            >
              <Icon name={icon.name} size={18} color={iconColor(icon.color, theme.dark)} className="text-muted" />
              <span className="truncate text-[14px]">{pageTitle(p)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
