// The only write path: ops in, records out. Each commit loads the touched records and
// their field clocks, merges the ops (applyOp), and writes the rows, clocks, ops and
// the clock state in one transaction. Commits are serialized.

import { and, eq } from "drizzle-orm";
import {
  HlcClock,
  applyOp,
  deriveSearchText,
  makeOps,
  uuidv7,
  withDefaults,
  type FieldChange,
  type FieldClocks,
  type Op,
  type TableName,
} from "@lumen/shared";
import { META_KEYS, RECORD_TABLES, field_clock, meta, ops as opsTable } from "@lumen/shared/schema/client";
import { db } from "./client";

export type ChangeListener = (changed: { table: TableName; id: string }[]) => void;

const listeners = new Set<ChangeListener>();
export const onChange = (listener: ChangeListener) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

let clock: HlcClock | undefined;

/** Loads (or creates) this device's id and clock. Call once before any commit. */
export async function initClock() {
  const rows = await db.select().from(meta);
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  let deviceId = get(META_KEYS.deviceId);
  if (!deviceId) {
    deviceId = uuidv7();
    await db.insert(meta).values({ key: META_KEYS.deviceId, value: deviceId });
  }
  clock = new HlcClock(deviceId, get(META_KEYS.lastHlc));
}

const getClock = () => {
  if (!clock) throw new Error("initClock() has not run");
  return clock;
};

let queue: Promise<unknown> = Promise.resolve();

/** Applies ops locally. `remote` ops (from sync) are stored as already synced. */
export function commit(ops: Op[], { remote = false } = {}): Promise<void> {
  const run = queue.then(() => commitNow(ops, remote));
  queue = run.catch(() => {});
  return run;
}

/** Ops for one write per record; see makeOps. */
export async function write(writes: { table: TableName; id: string; changes: FieldChange[] }[]) {
  const ops = writes.filter((w) => w.changes.length).flatMap((w) => makeOps(getClock(), w.table, w.id, w.changes));
  if (ops.length) await commit(ops);
}

async function commitNow(ops: Op[], remote: boolean) {
  const c = getClock();
  if (remote) for (const op of ops) c.receive(op.hlc);

  const groups = new Map<string, Op[]>();
  for (const op of ops) {
    const key = `${op.table}:${op.record_id}`;
    groups.set(key, [...(groups.get(key) ?? []), op]);
  }

  // Drizzle's builders don't type well across a union of tables, so this code is loosely typed.
  const statements: any[] = [];
  const changed: { table: TableName; id: string }[] = [];

  for (const group of groups.values()) {
    const { table, record_id: id } = group[0]!;
    const t = RECORD_TABLES[table] as any;
    const [row] = await db.select().from(t).where(eq(t.id, id));
    const clockRows = await db
      .select()
      .from(field_clock)
      .where(and(eq(field_clock.table_name, table), eq(field_clock.record_id, id)));

    const record: Record<string, unknown> = row ? { ...(row as object) } : { id };
    const clocks: FieldClocks = new Map(clockRows.map((r) => [r.path_key, r.hlc]));
    let applied = false;
    for (const op of group) applied = applyOp(record, clocks, op) || applied;
    if (!applied) continue;

    const next = withDefaults(table, record);
    if (table === "block") next.search_text = deriveSearchText(next.properties as never);
    const { id: _, ...set } = next;
    statements.push(db.insert(t).values(next).onConflictDoUpdate({ target: t.id, set }));
    statements.push(
      db.delete(field_clock).where(and(eq(field_clock.table_name, table), eq(field_clock.record_id, id))),
    );
    if (clocks.size) {
      statements.push(
        db.insert(field_clock).values([...clocks].map(([path_key, hlc]) => ({ table_name: table, record_id: id, path_key, hlc }))),
      );
    }
    changed.push({ table, id });
  }

  statements.push(
    db
      .insert(opsTable)
      .values(ops.map((op) => ({ ...op, table_name: op.table, synced: remote })))
      .onConflictDoNothing(),
    db
      .insert(meta)
      .values({ key: META_KEYS.lastHlc, value: c.current })
      .onConflictDoUpdate({ target: meta.key, set: { value: c.current } }),
  );

  await db.batch(statements as [any, ...any[]]);
  if (changed.length) for (const listener of listeners) listener(changed);
}
