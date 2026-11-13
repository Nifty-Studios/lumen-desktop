// The app's data layer: @lumen/shared/client over the Rust SQLite bridge (src-tauri/src/db.rs).
//
// Startup prefetch (src-tauri/src/boot.rs): while the webview was still loading, Rust already
// ran the read-only queries the last launch made while starting. Those answers arrive in one
// call and are served from memory until this launch writes anything. Meanwhile
// this launch's own startup reads are recorded as the plan for next time.

import { invoke } from "@tauri-apps/api/core";
import { createLumen, type SqlDriver } from "@lumen/shared/client";

interface Planned {
  key: string;
  sql: string;
  params: unknown[];
  method: string;
}

const MAX_PLAN = 160;
const isSelect = (sql: string) => /^\s*select\b/i.test(sql) && !sql.includes(";");
/** Statements that change nothing when the app is already set up. */
const harmless = (sql: string) => /^\s*create table if not exists\b/i.test(sql);

let prefetched: Map<string, unknown[]> | null = null;
let serving = true;
let recording: Planned[] | null = [];
const seen = new Set<string>();
export const bootStats = { served: 0, asked: 0, missed: [] as string[] };

const answers = invoke<{ key: string; rows: unknown[] }[]>("boot_take").then(
  (list) => (prefetched = serving ? new Map(list.map((a) => [a.key, a.rows])) : null),
  () => null,
);

function stopServing() {
  serving = false;
  prefetched = null;
}

const driver: SqlDriver = {
  async query(sql, params, method) {
    if (method !== "run" && isSelect(sql)) {
      const key = JSON.stringify([sql, params, method]);
      if (recording && !seen.has(key) && recording.length < MAX_PLAN) {
        seen.add(key);
        recording.push({ key, sql, params, method });
      }
      if (serving) {
        await answers;
        bootStats.asked++;
        const rows = prefetched?.get(key);
        // Nothing has been written since Rust read this, so it is still the answer.
        if (serving && rows !== undefined) {
          bootStats.served++;
          return rows;
        }
        if (import.meta.env.DEV) bootStats.missed.push(key.slice(0, 140));
      }
    } else if (!harmless(sql)) stopServing();
    return invoke<unknown[]>("db_query", { sql, params, method });
  },
  batch(queries) {
    stopServing();
    return invoke<unknown[][]>("db_batch", { queries });
  },
};

/**
 * The first screen is up: stop serving prefetched answers and save what this launch read as
 * the plan for the next one.
 */
export function finishBoot() {
  stopServing();
  const plan = recording;
  recording = null;
  if (plan?.length) void invoke("boot_plan", { queries: plan }).catch(() => {});
}

// Accounts and sync are on when the server is configured (desktop/.env.local, not committed).
// VITE_LUMEN_TOKEN is the shared token from before accounts, used once to claim old workspaces.
const url = import.meta.env.VITE_LUMEN_SERVER as string | undefined;
const legacyToken = import.meta.env.VITE_LUMEN_TOKEN as string | undefined;

export const lumen = createLumen(driver, { server: url ? { url, deviceName: "Windows desktop", legacyToken } : undefined });
