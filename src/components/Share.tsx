// Share a page, or the whole workspace. Workspace members have their role everywhere in it;
// someone a page is shared with gets that page and everything under it, nothing else.
// Invites need no email: they apply as soon as that address signs up or logs in.

import { useEffect, useState, type FormEvent } from "react";
import { canEdit, type Person, type Role } from "@lumen/shared";
import { AccountError } from "@lumen/shared/client";
import type { Block } from "@lumen/shared/schema/client";
import { account, listSpaces, pageTitle } from "../data/workspace";
import { useAccount, useLive } from "../data/hooks";
import { Icon } from "./Icon";
import { Segmented, TextInput } from "./ui";

type Tab = "page" | "workspace";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function ShareDialog({ page, onClose, onSignIn }: { page: Block; onClose: () => void; onSignIn: () => void }) {
  const { user } = useAccount();
  const spaces = useLive(listSpaces, []) ?? [];
  const space = spaces.find((s) => s.space.id === page.space_id);
  const [tab, setTab] = useState<Tab>("page");
  const [people, setPeople] = useState<Person[]>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const canManage = tab === "page" ? canEdit(space?.role) : space?.role === "owner";
  const roles: Role[] = tab === "page" ? ["editor", "viewer"] : ["owner", "editor", "viewer"];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!user) return;
    setPeople(undefined);
    setError(undefined);
    if (tab === "workspace" && !space) return setPeople([]);
    (tab === "page" ? account.pageShares(page.id) : account.members(page.space_id)).then(setPeople, (e) =>
      setError(e instanceof AccountError ? e.message : String(e)),
    );
  }, [tab, page.id, page.space_id, user, space]);

  const run = async (task: () => Promise<Person[]>) => {
    setBusy(true);
    setError(undefined);
    try {
      setPeople(await task());
      return true;
    } catch (e) {
      setError(e instanceof AccountError ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      tab === "page" ? account.sharePage(page.id, { email, role: role === "viewer" ? "viewer" : "editor" }) : account.invite(page.space_id, { email, role }),
    );
    if (ok) setEmail("");
  };
  const change = (p: Person, next: Role) =>
    run(() => (tab === "page" ? account.sharePage(page.id, { email: p.email, role: next === "viewer" ? "viewer" : "editor" }) : account.invite(page.space_id, { email: p.email, role: next })));
  const remove = (p: Person) => run(() => (tab === "page" ? account.unsharePage(page.id, p.email) : account.removeMember(page.space_id, p.email)));

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "var(--scrim)" }} onMouseDown={onClose}>
      <div className="surface animate-pop w-[min(480px,94vw)] rounded-[26px] p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon name="users" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[22px] leading-tight font-semibold">Share</h2>
            <p className="truncate text-[13px] text-muted">{tab === "page" ? `“${pageTitle(page)}” and the pages inside it` : `Everything in ${space?.space.name ?? "this workspace"}`}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        {!user ? (
          <div className="rounded-2xl bg-hover p-4 text-[13.5px] leading-relaxed">
            <p className="mb-3 text-muted">Sharing needs an account, so the people you invite can reach your notes.</p>
            <button onClick={onSignIn} className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 font-medium text-accent-fg hover:brightness-110">
              <Icon name="log-in" size={16} /> Sign in or create an account
            </button>
          </div>
        ) : (
          <>
            {space && (
              <Segmented
                value={tab}
                onChange={(t) => {
                  setTab(t);
                  setRole("editor");
                }}
                options={[
                  { value: "page", label: "This page", icon: "file-text" },
                  { value: "workspace", label: "Workspace", icon: "layers" },
                ]}
              />
            )}

            {canManage ? (
              <form onSubmit={invite} className="mt-4 flex flex-col gap-2.5">
                <TextInput type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                <div className="flex items-center gap-2">
                  <Segmented value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
                  <span className="flex-1" />
                  <button
                    type="submit"
                    disabled={busy || !email}
                    className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-[13.5px] font-medium text-accent-fg transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    <Icon name="user-plus" size={16} /> Invite
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-4 rounded-xl bg-hover px-3.5 py-2.5 text-[13px] text-muted">
                {tab === "page" ? "Only people who can edit this workspace can share its pages." : "Only owners can invite people to the workspace."}
              </p>
            )}

            {error && (
              <p className="mt-3 flex items-start gap-2 text-[13px] text-danger">
                <Icon name="triangle-alert" size={15} className="mt-0.5 flex-none" />
                {error}
              </p>
            )}

            <div className="mt-5 mb-1 text-[11px] font-medium tracking-[0.14em] text-faint uppercase">{tab === "page" ? "Shared with" : "Members"}</div>
            <div className="-mx-2 max-h-64 overflow-y-auto">
              {!people && <div className="px-2 py-3 text-[13px] text-muted">Loading…</div>}
              {people?.length === 0 && (
                <div className="px-2 py-3 text-[13px] text-muted">{tab === "page" ? "Only people in the workspace can see this page." : "Nobody yet."}</div>
              )}
              {people?.map((p) => {
                const me = p.email === user.email;
                return (
                  <div key={p.email} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-medium text-accent">
                      {(p.name ?? p.email)[0]!.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px]">
                        {p.name ?? p.email} {me && <span className="text-faint">(you)</span>}
                      </div>
                      <div className="truncate text-[12px] text-muted">{p.pending ? "Invited · joins when they sign up" : p.email}</div>
                    </div>
                    {canManage && !me ? (
                      <select
                        value={p.role}
                        onChange={(e) => change(p, e.target.value as Role)}
                        className="rounded-lg bg-transparent px-1.5 py-1 text-[12.5px] text-muted hover:bg-active"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-1.5 text-[12.5px] text-muted">{ROLE_LABEL[p.role]}</span>
                    )}
                    {(canManage || me) && p.role !== "owner" && (
                      <button
                        onClick={() => remove(p)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-active hover:text-danger"
                        title={me ? "Leave" : "Remove"}
                        aria-label={me ? "Leave" : "Remove"}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
