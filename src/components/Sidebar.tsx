import { useState, type ReactNode } from "react";
import type { Space } from "@lumen/shared/schema/client";
import { iconColor, resolveIcon, type IconName } from "@lumen/shared/icons";
import { useLive } from "../data/hooks";
import { createPage, pageTitle, pageTree, setPageAlive, trashedPages, type PageNode } from "../data/workspace";
import { useAmbient } from "../ambient/AmbientProvider";
import { Clock } from "../ambient/Clock";
import { Icon } from "./Icon";
import { Kbd, Popover } from "./ui";

interface Props {
  space: Space;
  currentId: string | null;
  onOpen: (id: string) => void;
  onSearch: () => void;
  onSettings: (section?: string) => void;
  onCollapse: () => void;
}

export function Sidebar({ space, currentId, onOpen, onSearch, onSettings, onCollapse }: Props) {
  const tree = useLive(() => pageTree(space), [space]) ?? [];
  const trash = useLive(trashedPages, []) ?? [];
  const [trashAnchor, setTrashAnchor] = useState<HTMLElement | null>(null);

  return (
    <aside className="glass flex w-[272px] shrink-0 flex-col overflow-hidden rounded-[22px] text-[13.5px] select-none">
      <Clock onOpenSky={() => onSettings("environment")} />

      <div className="px-2.5 pb-2">
        <Row icon="search" label="Search" hint={<Kbd>Ctrl K</Kbd>} onClick={onSearch} />
        <Row icon="plus" label="New page" hint={<Kbd>Ctrl N</Kbd>} onClick={() => createPage(space, null).then(onOpen)} />
      </div>

      <div className="group/pages flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Pages</span>
        <button
          className="grid h-6 w-6 place-items-center rounded-md text-faint opacity-0 transition-opacity group-hover/pages:opacity-100 hover:bg-hover hover:text-fg"
          onClick={() => createPage(space, null).then(onOpen)}
          aria-label="New page"
        >
          <Icon name="plus" size={15} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
        {tree.map((node) => (
          <TreeItem key={node.page.id} node={node} depth={0} space={space} currentId={currentId} onOpen={onOpen} />
        ))}
        {!tree.length && <div className="px-3 py-2 text-muted">No pages yet</div>}
      </nav>

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
  currentId: string | null;
  onOpen: (id: string) => void;
}

function TreeItem({ node, depth, space, currentId, onOpen }: ItemProps) {
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
        <span className="hidden gap-0.5 group-hover:flex">
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
          children.map((c) => <TreeItem key={c.page.id} node={c} depth={depth + 1} space={space} currentId={currentId} onOpen={onOpen} />)
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
