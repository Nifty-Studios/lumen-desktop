import { useState, type ReactNode } from "react";
import { canEdit, type Role } from "@lumen/shared";
import type { Space } from "@lumen/shared/schema/client";
import { iconColor, resolveIcon, type IconName } from "@lumen/shared/icons";
import { useAccount, useLive } from "../data/hooks";
import { account, createPage, listSpaces, pageTitle, pageTree, setPageAlive, sharedPages, trashedPages, type PageNode } from "../data/workspace";
import { useAmbient } from "../ambient/AmbientProvider";
import { Clock } from "../ambient/Clock";
import { Icon } from "./Icon";
import { Kbd, Popover } from "./ui";

interface Props {
  space: Space;
  role: Role | undefined;
  currentId: string | null;
  onOpen: (id: string) => void;
  onSearch: () => void;
  onSettings: (section?: string) => void;
  onCollapse: () => void;
  onSwitchSpace: (id: string) => void;
  onSignIn: () => void;
}

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function Sidebar({ space, role, currentId, onOpen, onSearch, onSettings, onCollapse, onSwitchSpace, onSignIn }: Props) {
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
        {editable && <Row icon="plus" label="New page" hint={<Kbd>Ctrl N</Kbd>} onClick={() => createPage(space, null).then(onOpen)} />}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
        <div className="group/pages flex items-center justify-between px-1.5 pt-2 pb-1">
          <span className="text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Pages</span>
          {editable && (
            <button
              className="grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 transition-opacity group-hover/pages:opacity-100 hover:bg-hover hover:text-fg"
              onClick={() => createPage(space, null).then(onOpen)}
              aria-label="New page"
            >
              <Icon name="plus" size={15} />
            </button>
          )}
        </div>
        {tree.map((node) => (
          <TreeItem key={node.page.id} node={node} depth={0} space={space} editable={editable} currentId={currentId} onOpen={onOpen} />
        ))}
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

function Row({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-muted transition-colors hover:bg-hover hover:text-fg">
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

function TreeItem({ node, depth, space, editable, currentId, onOpen }: ItemProps) {
  const { theme } = useAmbient();
  const [open, setOpen] = useState(false);
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
          <SmallButton label="Move to trash" icon="trash" onClick={() => setPageAlive(page.id, false)} />
        </span>
      </div>
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

function SmallButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <button
      title={label}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
