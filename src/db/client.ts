// The app's data layer: @lumen/shared/client over the Rust SQLite bridge (src-tauri/src/db.rs).

import { invoke } from "@tauri-apps/api/core";
import { createLumen, type SqlDriver } from "@lumen/shared/client";

const driver: SqlDriver = {
  query: (sql, params, method) => invoke<unknown[]>("db_query", { sql, params, method }),
  batch: (queries) => invoke<unknown[][]>("db_batch", { queries }),
};

// Sync is on when the server is configured (desktop/.env.local, not committed).
const url = import.meta.env.VITE_LUMEN_SERVER as string | undefined;
const token = import.meta.env.VITE_LUMEN_TOKEN as string | undefined;

export const lumen = createLumen(driver, { sync: url && token ? { url, token } : undefined });
