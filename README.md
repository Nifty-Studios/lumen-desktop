# Lumen desktop

Windows desktop app for Lumen, a light, local-first notes app. Built with Tauri 2, React 19, BlockNote and SQLite.

Requires the sibling repo [`lumen-shared`](https://github.com/Nifty-Studios/lumen-shared) checked out at `../shared` (linked with `link:../shared`).

```sh
pnpm install
pnpm tauri dev     # run the app
pnpm tauri build   # NSIS installer in src-tauri/target/release/bundle/nsis
pnpm test          # editor converter tests
pnpm typecheck
```

## How it fits together

- `src-tauri/src/db.rs`: SQLite bridge (rusqlite, bundled with FTS5). One connection, so `db_batch` runs as a single transaction. The database lives at `%APPDATA%\studio.nifty.lumen\lumen.db`.
- `src/db/`: Drizzle over that bridge (`sqlite-proxy`), migrations from `@lumen/shared`, and `store.ts`, the only write path. Ops are merged with `applyOp` and written together with their clocks and the outbox.
- `src/editor/`: BlockNote ↔ Lumen block conversion, and `diffPage`, which turns editor changes into minimal field ops.
- `src/data/workspace.ts`: pages, trash, search and first-launch setup.
- `src/components/`: sidebar, page view, editor and search dialog.

Shortcuts: `Ctrl+K` search, `Ctrl+N` new page, `/` in the editor for blocks.
