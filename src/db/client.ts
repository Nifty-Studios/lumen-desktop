// Drizzle over the Rust SQLite bridge (src-tauri/src/db.rs).

import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@lumen/shared/schema/client";

type Method = "run" | "all" | "values" | "get";

export interface RawQuery {
  sql: string;
  params?: unknown[];
  method?: Method;
}

export const rawQuery = (sql: string, params: unknown[] = [], method: Method = "all") =>
  invoke<unknown[]>("db_query", { sql, params, method });

export const rawBatch = (queries: RawQuery[]) =>
  invoke<unknown[]>("db_batch", {
    queries: queries.map((q) => ({ sql: q.sql, params: q.params ?? [], method: q.method ?? "run" })),
  });

export const db = drizzle(
  async (sql, params, method) => ({ rows: (await rawQuery(sql, params, method)) as any }),
  async (queries) => (await rawBatch(queries)).map((rows) => ({ rows: rows as any })),
  { schema },
);

export type Db = typeof db;
