import { and, eq, inArray, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { plainText, richText, uuidv7, type FieldChange, type Json } from "@lumen/shared";
import { block, space, type Block, type Space } from "@lumen/shared/schema/client";
import { db } from "../db/client";
import { write } from "../db/store";
import { diffPage } from "../editor/diff";
import type { Block as EditorBlock } from "@blocknote/core";

const fields = (values: Record<string, Json>): FieldChange[] =>
  Object.entries(values).map(([field, value]) => ({ path: [field], value }));

export async function getSpace(): Promise<Space | undefined> {
  const [s] = await db.select().from(space).where(eq(space.alive, true)).limit(1);
  return s;
}

/** First launch: create the workspace and a welcome page. */
export async function bootstrap(): Promise<Space> {
  const existing = await getSpace();
  if (existing) return existing;
  const now = Date.now();
  const spaceId = uuidv7();
  const pageId = uuidv7();
  const textId = uuidv7();
  await write([
    {
      table: "space",
      id: spaceId,
      changes: fields({ name: "My workspace", icon: null, pages: [pageId], alive: true, created_time: now, last_edited_time: now }),
    },
    {
      table: "block",
      id: pageId,
      changes: fields({
        space_id: spaceId,
        type: "page",
        properties: { title: richText("Welcome to Lumen") },
        content: [textId],
        format: { icon: { type: "emoji", value: "👋" } },
        parent_id: spaceId,
        parent_table: "space",
        collection_id: null,
        alive: true,
        created_time: now,
        last_edited_time: now,
      }),
    },
    {
      table: "block",
      id: textId,
      changes: fields({
        space_id: spaceId,
        type: "text",
        properties: { title: richText("Everything here is stored on this device. Type / for blocks.") },
        content: [],
        format: {},
        parent_id: pageId,
        parent_table: "block",
        collection_id: null,
        alive: true,
        created_time: now,
        last_edited_time: now,
      }),
    },
  ]);
  return (await getSpace())!;
}

export interface PageNode {
  page: Block;
  children: PageNode[];
}

/** The sidebar tree: alive pages under the space, ordered by their parent's list. */
export async function pageTree(s: Space): Promise<PageNode[]> {
  const pages = await db.select().from(block).where(and(eq(block.type, "page"), eq(block.alive, true)));
  const byId = new Map(pages.map((p) => [p.id, p]));
  const build = (ids: string[], seen: Set<string>): PageNode[] =>
    ids.flatMap((id) => {
      const page = byId.get(id);
      if (!page || seen.has(id)) return [];
      const next = new Set(seen).add(id);
      return [{ page, children: build(page.content, next) }];
    });
  return build(s.pages, new Set());
}

export async function getBlock(id: string): Promise<Block | undefined> {
  const [b] = await db.select().from(block).where(eq(block.id, id));
  return b;
}

/** Alive, non-page descendants of a page, i.e. what the editor shows. */
export async function loadPageBlocks(pageId: string): Promise<Map<string, Block>> {
  const out = new Map<string, Block>();
  let frontier = [pageId];
  while (frontier.length) {
    const rows = await db
      .select()
      .from(block)
      .where(and(inArray(block.parent_id, frontier), eq(block.alive, true), ne(block.type, "page")));
    frontier = [];
    for (const r of rows) {
      if (out.has(r.id)) continue;
      out.set(r.id, r);
      frontier.push(r.id);
    }
  }
  return out;
}

export async function savePage(pageId: string, doc: EditorBlock[]) {
  const page = await getBlock(pageId);
  if (!page) return;
  const stored = await loadPageBlocks(pageId);
  await write(diffPage(page, stored, doc));
}

export async function createPage(s: Space, parentId: string | null): Promise<string> {
  const now = Date.now();
  const id = uuidv7();
  const parent = parentId ? await getBlock(parentId) : undefined;
  await write([
    {
      table: "block",
      id,
      changes: fields({
        space_id: s.id,
        type: "page",
        properties: { title: [] },
        content: [],
        format: {},
        parent_id: parent ? parent.id : s.id,
        parent_table: parent ? "block" : "space",
        collection_id: null,
        alive: true,
        created_time: now,
        last_edited_time: now,
      }),
    },
    parent
      ? { table: "block", id: parent.id, changes: fields({ content: [...parent.content, id], last_edited_time: now }) }
      : { table: "space", id: s.id, changes: fields({ pages: [...s.pages, id], last_edited_time: now }) },
  ]);
  return id;
}

export const renamePage = (id: string, title: string) =>
  write([{ table: "block", id, changes: fields({ properties: { title: richText(title) }, last_edited_time: Date.now() }) }]);

export const setPageIcon = (id: string, emoji: string | null) =>
  write([
    {
      table: "block",
      id,
      changes: [
        { path: ["format", "icon"], value: emoji ? { type: "emoji", value: emoji } : null },
        { path: ["last_edited_time"], value: Date.now() },
      ],
    },
  ]);

export const setPageAlive = (id: string, alive: boolean) =>
  write([{ table: "block", id, changes: fields({ alive, last_edited_time: Date.now() }) }]);

export const trashedPages = () =>
  db.select().from(block).where(and(eq(block.type, "page"), eq(block.alive, false)));

export const pageTitle = (page: Pick<Block, "properties">) => plainText(page.properties.title) || "Untitled";

export interface SearchHit {
  pageId: string;
  snippet: string;
}

/** Full-text search; hits inside a page are reported against that page. */
export async function search(query: string): Promise<SearchHit[]> {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const match = terms.map((t, i) => `"${t.replaceAll('"', '""')}"${i === terms.length - 1 ? "*" : ""}`).join(" ");
  const rows = (await db.all(sql`
    WITH RECURSIVE hits AS (
      SELECT block.id, block.search_text, block_fts.rank AS rank
      FROM block_fts JOIN block ON block.rowid = block_fts.rowid
      WHERE block_fts MATCH ${match} AND block.alive = 1
      ORDER BY rank LIMIT 50
    ),
    up(id, parent_id, type, hit) AS (
      SELECT b.id, b.parent_id, b.type, b.id FROM block b JOIN hits ON b.id = hits.id
      UNION ALL
      SELECT p.id, p.parent_id, p.type, up.hit FROM block p JOIN up ON p.id = up.parent_id WHERE up.type != 'page'
    )
    SELECT up.id, hits.search_text FROM up
    JOIN hits ON hits.id = up.hit
    JOIN block page ON page.id = up.id
    WHERE up.type = 'page' AND page.alive = 1
    ORDER BY hits.rank
  `)) as [string, string][];
  const seen = new Set<string>();
  return rows.flatMap(([pageId, snippet]) => (seen.has(pageId) ? [] : (seen.add(pageId), [{ pageId, snippet }])));
}
