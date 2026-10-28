import { useState } from "react";
import type { Space } from "@lumen/shared/schema/client";
import { useLive } from "../data/hooks";
import { createPage, pageTitle, pageTree, setPageAlive, trashedPages, type PageNode } from "../data/workspace";

interface Props {
  space: Space;
  currentId: string | null;
  onOpen: (id: string) => void;
  onSearch: () => void;
}

export function Sidebar({ space, currentId, onOpen, onSearch }: Props) {
  const tree = useLive(() => pageTree(space), [space]) ?? [];
  const trash = useLive(trashedPages, []) ?? [];
  const [showTrash, setShowTrash] = useState(false);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel text-sm select-none">
      <div className="px-3 pt-3 pb-2 font-medium truncate">{space.name}</div>
      <div className="px-1.5">
        <SideButton onClick={onSearch} label="Search" hint="Ctrl K" icon="🔍" />
        <SideButton onClick={() => createPage(space, null).then(onOpen)} label="New page" hint="Ctrl N" icon="＋" />
      </div>
      <div className="mt-3 px-3 pb-1 text-xs font-medium text-muted">Pages</div>
      <nav className="flex-1 overflow-y-auto px-1.5 pb-2">
        {tree.map((node) => (
          <TreeItem key={node.page.id} node={node} depth={0} space={space} currentId={currentId} onOpen={onOpen} />
        ))}
      </nav>
      <div className="border-t border-border px-1.5 py-1.5">
        <SideButton onClick={() => setShowTrash((v) => !v)} label={`Trash${trash.length ? ` (${trash.length})` : ""}`} icon="🗑" />
        {showTrash && (
          <div className="max-h-48 overflow-y-auto pl-2">
            {trash.length === 0 && <div className="px-2 py-1 text-muted">Trash is empty</div>}
            {trash.map((p) => (
              <div key={p.id} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-hover">
                <span className="flex-1 truncate text-muted">{pageTitle(p)}</span>
                <button className="text-xs text-accent opacity-0 group-hover:opacity-100" onClick={() => setPageAlive(p.id, true)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SideButton({ onClick, label, hint, icon }: { onClick: () => void; label: string; hint?: string; icon: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-muted hover:bg-hover">
      <span className="w-4 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs opacity-60">{hint}</span>}
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
  const [open, setOpen] = useState(false);
  const { page, children } = node;
  const icon = page.format.icon?.type === "emoji" ? page.format.icon.value : "📄";
  const active = page.id === currentId;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded py-1 pr-1 cursor-pointer ${active ? "bg-hover font-medium" : "hover:bg-hover"}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onOpen(page.id)}
      >
        <button
          className="grid h-5 w-5 place-items-center rounded text-[10px] text-muted hover:bg-border"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? "▼" : "▶"}
        </button>
        <span className="w-5 text-center">{icon}</span>
        <span className="flex-1 truncate">{pageTitle(page)}</span>
        <span className="hidden gap-0.5 group-hover:flex">
          <IconButton
            label="Add a page inside"
            onClick={() =>
              createPage(space, page.id).then((id) => {
                setOpen(true);
                onOpen(id);
              })
            }
          >
            ＋
          </IconButton>
          <IconButton label="Move to trash" onClick={() => setPageAlive(page.id, false)}>
            🗑
          </IconButton>
        </span>
      </div>
      {open &&
        (children.length ? (
          children.map((c) => (
            <TreeItem key={c.page.id} node={c} depth={depth + 1} space={space} currentId={currentId} onOpen={onOpen} />
          ))
        ) : (
          <div className="py-1 text-xs text-muted" style={{ paddingLeft: 30 + depth * 14 }}>
            No pages inside
          </div>
        ))}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      className="grid h-5 w-5 place-items-center rounded text-xs text-muted hover:bg-border"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
