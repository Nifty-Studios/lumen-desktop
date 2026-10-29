import { useEffect, useRef, useState } from "react";
import type { Block } from "@lumen/shared/schema/client";
import type { PageSession } from "../data/workspace";
import { getBlock, openPage, pageTitle, renamePage, setPageAlive, setPageIcon } from "../data/workspace";
import { useLive } from "../data/hooks";
import { Editor } from "./Editor";

const EMOJIS = ["📄", "📝", "📌", "💡", "✅", "📚", "🎯", "🗂", "🧠", "🚀", "🌱", "⭐", "🔥", "🎨", "🛠", "📅", "💼", "🏠", "✈️", "🍳", "🎵", "💬", "🔒", "👋"];

export function PageView({ pageId }: { pageId: string }) {
  const page = useLive(() => getBlock(pageId), [pageId]);
  // The editor's blocks load once per page; after that the editor owns the document.
  const [session, setSession] = useState<PageSession>();
  useEffect(() => {
    openPage(pageId).then(setSession, console.error);
  }, [pageId]);

  if (!page || !session) return null;

  if (!page.alive)
    return (
      <div className="mx-auto max-w-3xl px-16 py-6">
        <div className="flex items-center justify-between rounded bg-red-500/10 px-4 py-2 text-sm">
          <span>This page is in the trash.</span>
          <button className="font-medium text-accent" onClick={() => setPageAlive(page.id, true)}>
            Restore
          </button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-16 pt-16 pb-40">
      <IconPicker page={page} />
      <Title page={page} />
      <Editor page={page} session={session} />
    </div>
  );
}

function IconPicker({ page }: { page: Block }) {
  const [open, setOpen] = useState(false);
  const icon = page.format.icon?.type === "emoji" ? page.format.icon.value : null;
  return (
    <div className="relative mb-2">
      <button
        className={icon ? "rounded text-5xl leading-none hover:bg-hover p-1" : "rounded px-1.5 py-0.5 text-sm text-muted hover:bg-hover"}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ?? "Add icon"}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 grid w-72 grid-cols-8 gap-1 rounded-lg border border-border bg-bg p-2 shadow-lg">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="rounded p-1 text-xl hover:bg-hover"
              onClick={() => {
                setPageIcon(page.id, e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
          {icon && (
            <button
              className="col-span-8 rounded py-1 text-sm text-muted hover:bg-hover"
              onClick={() => {
                setPageIcon(page.id, null);
                setOpen(false);
              }}
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Title({ page }: { page: Block }) {
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
      className="mb-4 w-full resize-none overflow-hidden bg-transparent text-4xl font-bold outline-none placeholder:text-muted/50"
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, "");
        setValue(next);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => renamePage(page.id, next), 300);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (document.querySelector(".bn-editor") as HTMLElement | null)?.focus();
        }
      }}
    />
  );
}
