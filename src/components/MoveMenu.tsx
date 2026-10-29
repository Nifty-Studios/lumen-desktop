// "Move to…": put a page in a group, inside another page, or back at the top level.

import type { Block, Space } from "@lumen/shared/schema/client";
import { isGroup, movePage, pageTitle, pageTree, type PageNode } from "../data/workspace";
import { useLive } from "../data/hooks";
import { useToast } from "./ui";
import { Icon } from "./Icon";
import { Popover } from "./ui";

export function MoveMenu({ anchor, page, space, onClose }: { anchor: HTMLElement; page: Block; space: Space; onClose: () => void }) {
  const toast = useToast();
  const tree = useLive(() => pageTree(space), [space]) ?? [];
  // Anywhere except the page itself and what's inside it.
  const targets: { node: PageNode; depth: number }[] = [];
  const walk = (nodes: PageNode[], depth: number) => {
    for (const n of nodes) {
      if (n.page.id === page.id) continue;
      targets.push({ node: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);

  const move = async (to: string | null, label: string) => {
    onClose();
    try {
      await movePage(page.id, to);
      toast(`Moved to ${label}`, { icon: "folder" });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    }
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Move “{pageTitle(page)}” to</div>
      <div className="max-h-80 overflow-y-auto">
        {page.parent_table !== "space" && (
          <button onClick={() => move(null, "the top level")} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] hover:bg-hover">
            <Icon name="layers" size={15} className="text-muted" /> Top level
          </button>
        )}
        {targets.map(({ node, depth }) => {
          const group = isGroup(node.page);
          return (
            <button
              key={node.page.id}
              disabled={node.page.id === page.parent_id}
              onClick={() => move(node.page.id, pageTitle(node.page))}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-40"
              style={{ paddingLeft: 10 + depth * 14 }}
            >
              <Icon name={group ? "folder" : "file-text"} size={15} className="text-muted" />
              <span className={`truncate ${group ? "font-medium" : ""}`}>{pageTitle(node.page)}</span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
