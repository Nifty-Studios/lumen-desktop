// Turns the editor's current document into field changes against the stored blocks.
// Only fields that actually changed produce ops, so small edits make small ops.

import type { Block as EditorBlock } from "@blocknote/core";
import type { FieldChange, Json, TableName } from "@lumen/shared";
import type { Block } from "@lumen/shared/schema/client";
import { fromEditorBlock, isEditorBlock } from "./convert";

export interface RecordWrite {
  table: TableName;
  id: string;
  changes: FieldChange[];
}

/** Key-order-independent equality for JSON values. */
export const sameJson = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );

/**
 * @param page     the page block being edited
 * @param stored   alive descendants of the page that the editor shows (from loadPageBlocks)
 * @param doc      editor.document
 */
export function diffPage(page: Block, stored: Map<string, Block>, doc: EditorBlock[], now = Date.now()): RecordWrite[] {
  const writes: RecordWrite[] = [];
  const seen = new Set<string>();

  const visit = (blocks: EditorBlock[], parentId: string): string[] =>
    blocks.map((b) => {
      seen.add(b.id);
      const fields = fromEditorBlock(b);
      const content = visit(b.children, b.id);
      const desired: Record<string, Json> = {
        type: fields.type,
        properties: fields.properties as Json,
        format: fields.format as Json,
        content,
        parent_id: parentId,
        parent_table: "block",
      };
      const existing = stored.get(b.id);
      if (!existing) {
        writes.push({
          table: "block",
          id: b.id,
          changes: Object.entries({
            ...desired,
            space_id: page.space_id,
            collection_id: null,
            alive: true,
            created_time: now,
            last_edited_time: now,
          }).map(([field, value]) => ({ path: [field], value })),
        });
      } else {
        const changes = Object.entries(desired)
          .filter(([field, value]) => !sameJson((existing as Record<string, unknown>)[field], value))
          .map(([field, value]) => ({ path: [field], value }));
        if (changes.length) {
          changes.push({ path: ["last_edited_time"], value: now });
          writes.push({ table: "block", id: b.id, changes });
        }
      }
      return b.id;
    });

  const topLevel = visit(doc, page.id);

  // Child pages and other non-editor blocks stay in the page's content, after the editor's blocks.
  const kept = page.content.filter((id) => !seen.has(id) && !stored.has(id));
  const pageContent = [...topLevel, ...kept];
  if (!sameJson(page.content, pageContent)) {
    writes.push({
      table: "block",
      id: page.id,
      changes: [
        { path: ["content"], value: pageContent },
        { path: ["last_edited_time"], value: now },
      ],
    });
  }

  for (const [id, block] of stored) {
    if (!seen.has(id) && isEditorBlock(block.type)) {
      writes.push({
        table: "block",
        id,
        changes: [
          { path: ["alive"], value: false },
          { path: ["last_edited_time"], value: now },
        ],
      });
    }
  }
  return writes;
}
