import { clientMigrations } from "@lumen/shared/schema/migrations";
import { rawBatch, rawQuery } from "./client";

/** Applies pending migrations from @lumen/shared, each in its own transaction. */
export async function migrate() {
  await rawQuery("CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)", [], "run");
  const applied = new Set(((await rawQuery("SELECT tag FROM _migrations")) as [string][]).map(([tag]) => tag));
  for (const { tag, statements } of clientMigrations) {
    if (applied.has(tag)) continue;
    await rawBatch([
      ...statements.map((sql) => ({ sql })),
      { sql: "INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)", params: [tag, Date.now()] },
    ]);
  }
}
