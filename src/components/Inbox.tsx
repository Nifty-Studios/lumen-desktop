// Notifications: pages and workspaces shared with you, friend requests. Each one does something
// when clicked (open the page, switch to the workspace, accept the request).

import { useEffect, useState } from "react";
import type { LumenNotification } from "@lumen/shared";
import type { IconName } from "@lumen/shared/icons";
import { lumen } from "../db/client";
import { useAccount } from "../data/hooks";
import { Icon } from "./Icon";
import { Popover, useToast } from "./ui";

const ICON: Record<LumenNotification["kind"], IconName> = {
  page_shared: "file-text",
  space_shared: "layers",
  friend_request: "user-plus",
  friend_accepted: "user-check",
};

export function useInbox() {
  const [, render] = useState(0);
  useEffect(() => lumen.inbox.onChange(() => render((n) => n + 1)), []);
  return { items: lumen.inbox.items, unread: lumen.inbox.unread() };
}

export function ago(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(t).toLocaleDateString();
}

interface Actions {
  onOpen: (pageId: string) => void;
  onSwitchSpace: (spaceId: string) => void;
  onFriends: () => void;
}

/** Does what a notification is about. Shared with you a moment ago? Sync first so it's here. */
export async function openNotification(n: LumenNotification, { onOpen, onSwitchSpace, onFriends }: Actions) {
  void lumen.inbox.markRead([n.id]);
  if (n.kind === "friend_request" || n.kind === "friend_accepted") return onFriends();
  if (n.kind === "space_shared" && n.space_id) {
    if (!(await lumen.listSpaces()).some((s) => s.space.id === n.space_id)) await lumen.connect().catch(() => {});
    return onSwitchSpace(n.space_id);
  }
  if (n.page_id) {
    if (!(await lumen.getBlock(n.page_id))) await lumen.connect().catch(() => {});
    if (await lumen.getBlock(n.page_id)) onOpen(n.page_id);
  }
}

export function InboxButton(props: Actions) {
  const { user } = useAccount();
  const { unread } = useInbox();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;
  return (
    <>
      <button
        onClick={(e) => {
          setAnchor(anchor ? null : e.currentTarget);
          void lumen.refreshInbox();
        }}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Icon name="bell" size={16} />
        <span className="flex-1">Notifications</span>
        {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">{unread}</span>}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={340}>
          <InboxList
            {...props}
            onDone={() => setAnchor(null)}
          />
        </Popover>
      )}
    </>
  );
}

function InboxList({ onDone, ...actions }: Actions & { onDone: () => void }) {
  const { items, unread } = useInbox();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();

  const answer = async (n: LumenNotification, accept: boolean) => {
    if (!n.friendship_id) return;
    setBusy(n.id);
    try {
      if (accept) await lumen.account.acceptFriend(n.friendship_id);
      else await lumen.account.removeFriend(n.friendship_id);
      await lumen.inbox.markRead([n.id]);
      await lumen.refreshInbox();
      if (accept && n.actor) toast(`You and ${n.actor.name} are friends now`, { icon: "user-check" });
    } catch (e) {
      toast(String(e).replace(/^Error: /, ""), { tone: "error" });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1 px-2.5 pt-1.5 pb-1">
        <span className="flex-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">Notifications</span>
        {unread > 0 && (
          <button onClick={() => lumen.inbox.markRead()} className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-fg" title="Mark all as read">
            <Icon name="check-check" size={15} />
          </button>
        )}
        {items.length > 0 && (
          <button onClick={() => lumen.inbox.clear()} className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-fg">
            Clear
          </button>
        )}
      </div>
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-muted">
          <Icon name="bell" size={22} className="text-faint" />
          Nothing yet. Shares and friend requests show up here.
        </div>
      )}
      <div className="max-h-[420px] overflow-y-auto">
        {items.map((n) => {
          const pendingRequest = n.kind === "friend_request" && !n.read_at;
          return (
            <div
              key={n.id}
              role="button"
              onClick={() => {
                if (pendingRequest) return;
                onDone();
                void openNotification(n, actions);
              }}
              className="flex gap-3 rounded-xl px-2.5 py-2.5 hover:bg-hover"
            >
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${n.read_at ? "bg-hover text-muted" : "bg-accent-soft text-accent"}`}>
                <Icon name={ICON[n.kind]} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] leading-snug ${n.read_at ? "" : "font-medium"}`}>{n.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{n.body}</div>
                <div className="mt-1 text-[11.5px] text-faint">{ago(n.created_at)}</div>
                {pendingRequest && (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      disabled={busy === n.id}
                      onClick={() => void answer(n, true)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      disabled={busy === n.id}
                      onClick={() => void answer(n, false)}
                      className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted hover:bg-active hover:text-fg disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
