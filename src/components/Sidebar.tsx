import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { ReleaseNote } from "@lumen/shared/client";
import { lumen } from "../db/client";
import { InboxButton } from "./Inbox";
import { canEdit, type Role } from "@lumen/shared";
import type { Space } from "@lumen/shared/schema/client";
import { iconColor, resolveIcon, type IconName } from "@lumen/shared/icons";
import { useAccount, useLive } from "../data/hooks";
import {
  account,
  createGroup,
  createPage,
  isGroup,
  listSpaces,
  movePage,
  pageTitle,
  pageTree,
  renamePage,
  setPageAlive,
  sharedPages,
  trashedPages,
  type PageNode,
} from "../data/workspace";
import { MoveMenu } from "./MoveMenu";
import { useAmbient } from "../ambient/AmbientProvider";
import { Clock } from "../ambient/Clock";
import { Icon } from "./Icon";
import { Kbd, Popover } from "./ui";
import { updates, useUpdate } from "../lib/updates";

interface Props {
  space: Space;
  role: Role | undefined;
  currentId: string | null;
  onOpen: (id: string) => void;
  calendarOpen: boolean;
  onCalendar: () => void;
  onSearch: () => void;
  onSettings: (section?: string) => void;
  onCollapse: () => void;
  onSwitchSpace: (id: string) => void;
  onSignIn: () => void;
}

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function Sidebar({ space, role, currentId, calendarOpen, onCalendar, onOpen, onSearch, onSettings, onCollapse, onSwitchSpace, onSignIn }: Props) {
  const tree = useLive(() => pageTree(space), [space]) ?? [];
  const trash = useLive(trashedPages, []) ?? [];
  const shared = useLive(async () => {
    const pages = await sharedPages();
    const roles = new Map(pages.map((p) => [p.page.id, p.role]));
    // pageTree only reads `pages`, so shared pages make a little tree of their own.
    const nodes = await pageTree({ pages: pages.map((p) => p.page.id) } as Space);
    return nodes.map((node) => ({ node, role: roles.get(node.page.id) }));
  }, []) ?? [];
  const [trashAnchor, setTrashAnchor] = useState<HTMLElement | null>(null);
  const editable = canEdit(role);

  return (
    <aside className="glass flex w-[272px] shrink-0 flex-col overflow-hidden rounded-[22px] text-[13.5px] select-none">
      <Clock onOpenSky={() => onSettings("environment")} />

      <div className="px-2.5 pb-2">
        <SpaceSwitcher space={space} role={role} onSwitch={onSwitchSpace} />
        <Row icon="search" label="Search" hint={<Kbd>Ctrl K</Kbd>} onClick={onSearch} />
        <InboxButton onOpen={onOpen} onSwitchSpace={onSwitchSpace} onFriends={() => onSettings("friends")} />
        <Row icon="calendar-days" label="Calendar" active={calendarOpen} onClick={onCalendar} />
        {editable && <Row icon="plus" label="New page" hint={<Kbd>Ctrl N</Kbd>} onClick={() => createPage(space, null).then(onOpen)} />}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
        <div className="group/pages flex items-center justify-between px-1.5 pt-2 pb-1">
          <span className="text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Pages</span>
          {editable && (
            <span className="flex gap-0.5 opacity-0 transition-opacity group-hover/pages:opacity-100">
              <button
                className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg"
                onClick={() => createGroup(space, "New group")}
                aria-label="New group"
                title="New group"
              >
                <Icon name="folder" size={14} />
              </button>
              <button
                className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg"
                onClick={() => createPage(space, null).then(onOpen)}
                aria-label="New page"
                title="New page"
              >
                <Icon name="plus" size={15} />
              </button>
            </span>
          )}
        </div>
        {tree.map((node) =>
          isGroup(node.page) ? (
            <GroupItem key={node.page.id} node={node} space={space} editable={editable} currentId={currentId} onOpen={onOpen} />
          ) : (
            <TreeItem key={node.page.id} node={node} depth={0} space={space} editable={editable} currentId={currentId} onOpen={onOpen} />
          ),
        )}
        {!tree.length && <div className="px-3 py-2 text-muted">No pages yet</div>}

        {shared.length > 0 && (
          <>
            <div className="px-1.5 pt-4 pb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Shared with me</div>
            {shared.map(({ node, role: r }) => (
              <TreeItem
                key={node.page.id}
                node={node}
                depth={0}
                space={{ id: node.page.space_id } as Space}
                editable={canEdit(r)}
                currentId={currentId}
                onOpen={onOpen}
              />
            ))}
          </>
        )}
      </nav>

      <WhatsNewCard />
      <UpdateCard />
      <AccountCard onSignIn={onSignIn} />

      <div className="flex items-center gap-1 px-2.5 pt-1 pb-2.5">
        <FooterButton icon="trash" label={trash.length ? `Trash · ${trash.length}` : "Trash"} onClick={(e) => setTrashAnchor(trashAnchor ? null : e)} />
        <span className="flex-1" />
        <FooterButton icon="settings" label="Settings" onClick={() => onSettings()} iconOnly />
        <FooterButton icon="panel-left" label="Hide sidebar (Ctrl \)" onClick={onCollapse} iconOnly />
      </div>

      {trashAnchor && (
        <Popover anchor={trashAnchor} onClose={() => setTrashAnchor(null)} width={300}>
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Trash</div>
          {trash.length === 0 && <div className="px-2.5 py-3 text-[13px] text-muted">Nothing in the trash.</div>}
          <div className="max-h-72 overflow-y-auto">
            {trash.map((p) => (
              <div key={p.id} className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-hover">
                <Icon name={resolveIcon(p.format.icon).name} size={15} className="text-faint" />
                <button className="flex-1 truncate text-left text-[13px] text-muted" onClick={() => (onOpen(p.id), setTrashAnchor(null))}>
                  {pageTitle(p)}
                </button>
                <button className="rounded-lg px-2 py-0.5 text-[12px] text-accent opacity-0 group-hover:opacity-100 hover:bg-hover" onClick={() => setPageAlive(p.id, true)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </aside>
  );
}

/** The workspace in view, and the others this account can open. */
function SpaceSwitcher({ space, role, onSwitch }: { space: Space; role: Role | undefined; onSwitch: (id: string) => void }) {
  const spaces = useLive(listSpaces, []) ?? [];
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (spaces.length < 2 && role !== "viewer") return null;
  return (
    <>
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft text-[12px] font-semibold text-accent">{space.name[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{space.name}</span>
          {role && role !== "owner" && <span className="block text-[11.5px] text-faint">{ROLE_LABEL[role]}</span>}
        </span>
        <Icon name="chevrons-up-down" size={14} className="text-faint" />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={250}>
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Workspaces</div>
          {spaces.map((s) => (
            <button
              key={s.space.id}
              onClick={() => {
                setAnchor(null);
                onSwitch(s.space.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-hover"
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-hover text-[12px] font-semibold">{s.space.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]">{s.space.name}</span>
                <span className="block text-[11.5px] text-faint">{ROLE_LABEL[s.role]}</span>
              </span>
              {s.space.id === space.id && <Icon name="check" size={15} className="text-accent" />}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}

/** Signed out: a gentle nudge (now and then, after "Later") to sign in and sync. */
function AccountCard({ onSignIn }: { onSignIn: () => void }) {
  const { user, reminderDue, available } = useAccount();
  // Shown when the reminder is due, or when the session ended without "Later" (signed out elsewhere).
  if (!available || user || !(reminderDue || !account.skipped)) return null;
  return (
    <div className="mx-2.5 mb-1.5 rounded-2xl bg-accent-soft px-3.5 py-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Icon name="cloud" size={16} className="text-accent" />
        {account.skipped ? "Keep your notes safe" : "You're signed out"}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">
        {account.skipped ? "Sign in to sync your notes to your other devices and share pages." : "Sign in again to keep syncing."}
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <button onClick={onSignIn} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:brightness-110">
          Sign in
        </button>
        {account.skipped && (
          <button onClick={() => account.snoozeReminder()} className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/** After an update: what changed, until it's dismissed (or two weeks pass). */
function WhatsNewCard() {
  const [note, setNote] = useState<{ version: string; note: ReleaseNote }>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    getVersion()
      .then(async (version) => {
        const n = await lumen.whatsNew(version);
        if (n) setNote({ version, note: n });
      })
      .catch(() => {});
  }, []);
  if (!note) return null;
  const dismiss = () => {
    void lumen.dismissWhatsNew(note.version);
    setNote(undefined);
    setOpen(false);
  };
  return (
    <>
      <div className="mx-2.5 mb-1.5 rounded-2xl bg-accent-soft px-3.5 py-3">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Icon name="party-popper" size={16} className="text-accent" />
          New in Lumen {note.version}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">{note.note.title}</p>
        <div className="mt-2.5 flex gap-1.5">
          <button onClick={() => setOpen(true)} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:brightness-110">
            See what's new
          </button>
          <button onClick={dismiss} className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
            Got it
          </button>
        </div>
      </div>
      {open && (
        <div className="animate-fade fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "var(--scrim)" }} onMouseDown={() => setOpen(false)}>
          <div className="surface animate-pop w-[min(460px,94vw)] rounded-[26px] p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Lumen {note.version}</div>
            <h2 className="mb-4 font-serif text-[22px] leading-tight font-semibold">{note.note.title}</h2>
            <div className="space-y-3.5">
              {note.note.items.map((i) => (
                <div key={i.title} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
                  <div>
                    <div className="text-[14px] font-medium">{i.title}</div>
                    <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={dismiss} className="rounded-xl bg-accent px-4 py-2 text-[13.5px] font-medium text-accent-fg hover:brightness-110">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A new version of Lumen: download it, then install it (which restarts the app). */
function UpdateCard() {
  const u = useUpdate();
  if (u.phase === "idle") return null;
  const button = "rounded-lg px-3 py-1.5 text-[12.5px]";
  return (
    <div className="mx-2.5 mb-1.5 rounded-2xl bg-accent-soft px-3.5 py-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Icon name={u.phase === "error" ? "triangle-alert" : "download"} size={16} className="text-accent" />
        {u.phase === "available" && `Lumen ${u.version} is here`}
        {u.phase === "downloading" && `Downloading ${u.version}…`}
        {u.phase === "ready" && "Ready to install"}
        {u.phase === "installing" && "Installing…"}
        {u.phase === "error" && "The update didn't work"}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">
        {u.phase === "available" && "A new version is ready to download."}
        {u.phase === "downloading" && "You can keep writing."}
        {u.phase === "ready" && "Lumen will close and reopen. Your notes are saved."}
        {u.phase === "installing" && "Lumen will reopen in a moment."}
        {u.phase === "error" && (u.stage === "install" ? "The installer didn't finish. Try again, or get the latest Lumen from the download page." : "Check your connection and try again.")}
        {u.phase === "error" && u.message && <span className="mt-1 block text-[11.5px] break-words text-faint">{u.message}</span>}
      </p>
      {u.phase === "downloading" && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-active">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(u.progress * 100)}%` }} />
        </div>
      )}
      {(u.phase === "available" || u.phase === "ready" || u.phase === "error") && (
        <div className="mt-2.5 flex gap-1.5">
          <button
            onClick={() => (u.phase === "available" ? updates.download() : u.phase === "ready" ? updates.install() : updates.retry())}
            className={`${button} bg-accent font-medium text-accent-fg hover:brightness-110`}
          >
            {u.phase === "available" ? "Download" : u.phase === "ready" ? "Install now" : "Try again"}
          </button>
          <button onClick={() => updates.later()} className={`${button} text-muted hover:bg-hover hover:text-fg`}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, hint, active, onClick }: { icon: IconName; label: string; hint?: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-hover hover:text-fg ${active ? "bg-active text-fg" : "text-muted"}`}>
      <Icon name={icon} size={16} />
      <span className="flex-1">{label}</span>
      {hint}
    </button>
  );
}

function FooterButton({ icon, label, onClick, iconOnly }: { icon: IconName; label: string; onClick: (el: HTMLElement) => void; iconOnly?: boolean }) {
  return (
    <button
      onClick={(e) => onClick(e.currentTarget)}
      title={label}
      aria-label={label}
      className={`flex h-8 items-center gap-2 rounded-xl text-muted transition-colors hover:bg-hover hover:text-fg ${iconOnly ? "w-8 justify-center" : "px-2.5"}`}
    >
      <Icon name={icon} size={16} />
      {!iconOnly && <span className="text-[13px]">{label}</span>}
    </button>
  );
}

interface ItemProps {
  node: PageNode;
  depth: number;
  space: Space;
  editable: boolean;
  currentId: string | null;
  onOpen: (id: string) => void;
}

/** A group: a collapsible section header over its pages. Double-click the name to rename it. */
function GroupItem({ node, space, editable, currentId, onOpen }: Omit<ItemProps, "depth">) {
  const { page, children } = node;
  const [open, setOpen] = useState(true);
  const [naming, setNaming] = useState(pageTitle(page) === "New group" && editable);
  return (
    <div className="mt-2">
      <div className="group flex h-8 items-center gap-1 rounded-xl pr-1 text-faint hover:bg-hover" onClick={() => setOpen((v) => !v)}>
        <span className="grid h-6 w-6 place-items-center">
          <Icon name="chevron-right" size={13} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 150ms" }} />
        </span>
        {naming ? (
          <input
            autoFocus
            defaultValue={pageTitle(page) === "New group" ? "" : pageTitle(page)}
            placeholder="Group name"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              if (e.target.value.trim()) renamePage(page.id, e.target.value.trim());
              setNaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            className="min-w-0 flex-1 rounded-md bg-hover px-1.5 py-0.5 text-[12px] font-medium tracking-[0.08em] text-fg uppercase"
          />
        ) : (
          <span
            className="flex-1 truncate text-[11.5px] font-medium tracking-[0.12em] uppercase"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (editable) setNaming(true);
            }}
          >
            {pageTitle(page)}
          </span>
        )}
        {editable && (
          <span className="hidden gap-0.5 group-hover:flex">
            <SmallButton label="Add a page to this group" icon="plus" onClick={() => createPage(space, page.id).then(onOpen)} />
            <SmallButton label="Rename group" icon="pencil" onClick={() => setNaming(true)} />
            <SmallButton
              label="Remove group (its pages stay)"
              icon="trash"
              onClick={async () => {
                for (const c of children) await movePage(c.page.id, null);
                await setPageAlive(page.id, false);
              }}
            />
          </span>
        )}
      </div>
      {open &&
        (children.length ? (
          children.map((c) => <TreeItem key={c.page.id} node={c} depth={0} space={space} editable={editable} currentId={currentId} onOpen={onOpen} />)
        ) : (
          <div className="py-1 pl-8 text-[12px] text-faint">Empty · use “Move to” on a page</div>
        ))}
    </div>
  );
}

function TreeItem({ node, depth, space, editable, currentId, onOpen }: ItemProps) {
  const { theme } = useAmbient();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState<HTMLElement | null>(null);
  const { page, children } = node;
  const icon = resolveIcon(page.format.icon);
  const active = page.id === currentId;

  return (
    <div>
      <div
        className={`group flex h-8 cursor-default items-center gap-1 rounded-xl pr-1 transition-colors ${active ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg"}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onOpen(page.id)}
      >
        <button
          className={`grid h-6 w-6 place-items-center rounded-md text-faint transition-opacity hover:bg-hover ${children.length ? "" : "opacity-0 group-hover:opacity-60"}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <Icon name="chevron-right" size={14} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 150ms" }} />
        </button>
        <Icon name={icon.name} size={16} color={iconColor(icon.color, theme.dark)} />
        <span className={`ml-1 flex-1 truncate ${active ? "font-medium" : ""}`}>{pageTitle(page)}</span>
        <span className={editable ? "hidden gap-0.5 group-hover:flex" : "hidden"}>
          <SmallButton
            label="Add a page inside"
            icon="plus"
            onClick={() =>
              createPage(space, page.id).then((id) => {
                setOpen(true);
                onOpen(id);
              })
            }
          />
          <SmallButton label="Move to…" icon="folder" onClick={(el) => setMoving(el)} />
          <SmallButton label="Move to trash" icon="trash" onClick={() => setPageAlive(page.id, false)} />
        </span>
      </div>
      {moving && <MoveMenu anchor={moving} page={page} space={space} onClose={() => setMoving(null)} />}
      {open &&
        (children.length ? (
          children.map((c) => <TreeItem key={c.page.id} node={c} depth={depth + 1} space={space} editable={editable} currentId={currentId} onOpen={onOpen} />)
        ) : (
          <div className="py-1 text-[12px] text-faint" style={{ paddingLeft: 34 + depth * 14 }}>
            No pages inside
          </div>
        ))}
    </div>
  );
}

function SmallButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      title={label}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
