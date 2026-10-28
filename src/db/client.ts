// The app's data layer: @lumen/shared/client over the Rust SQLite bridge (src-tauri/src/db.rs).

import { invoke } from "@tauri-apps/api/core";
import { createLumen, type SqlDriver } from "@lumen/shared/client";

const driver: SqlDriver = {
  query: (sql, params, method) => invoke<unknown[]>("db_query", { sql, params, method }),
  batch: (queries) => invoke<unknown[][]>("db_batch", { queries }),
};

export const lumen = createLumen(driver);
