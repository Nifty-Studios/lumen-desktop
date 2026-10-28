import type { Block as EditorBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import type { Block } from "@lumen/shared/schema/client";
import { fromEditorBlock, inlineToRichText, richTextToInline, toEditorBlock } from "./convert";
import { diffPage } from "./diff";

const block = (over: Partial<Block> & Pick<Block, "id" | "type">): Block => ({
  space_id: "s",
  properties: {},
  content: [],
  format: {},
  parent_id: "page",
  parent_table: "block",
  collection_id: null,
  alive: true,
  created_time: 0,
  last_edited_time: 0,
  search_text: "",
  ...over,
});

/** What the editor hands back for a block we gave it (fills BlockNote defaults). */
const asEditorBlock = (partial: ReturnType<typeof toEditorBlock>): EditorBlock =>
  ({
    ...partial,
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", ...partial.props },
    children: (partial.children ?? []).map((c) => asEditorBlock(c as never)),
  }) as EditorBlock;

describe("inline rich text", () => {
  it("round-trips marks and links", () => {
    const rt = [
      { text: "plain " },
      { text: "bold", marks: [{ type: "bold" as const }] },
      { text: " link", marks: [{ type: "link" as const, value: "https://x.dev" }] },
      { text: "ed", marks: [{ type: "italic" as const }, { type: "link" as const, value: "https://x.dev" }] },
      { text: " red", marks: [{ type: "color" as const, value: "red" }] },
    ];
    const inline = richTextToInline(rt);
    expect(inline.filter((i) => i.type === "link")).toHaveLength(1);
    expect(inlineToRichText(inline)).toEqual(rt);
  });
});

describe("blocks", () => {
  const cases: Block[] = [
    block({ id: "p", type: "text", properties: { title: [{ text: "Hello" }] } }),
    block({ id: "h", type: "sub_header", properties: { title: [{ text: "Section" }] } }),
    block({ id: "t", type: "to_do", properties: { title: [{ text: "Buy milk" }], checked: true } }),
    block({ id: "c", type: "code", properties: { title: [{ text: "let x = 1" }], language: "ts" } }),
    block({ id: "q", type: "quote", properties: { title: [{ text: "Quote" }] }, format: { color: "blue" } }),
    block({ id: "d", type: "divider" }),
    block({ id: "i", type: "image", properties: { source: "a.png", caption: [{ text: "cap" }] } }),
  ];

  it.each(cases)("$type round-trips", (b) => {
    const back = fromEditorBlock(asEditorBlock(toEditorBlock(b, new Map())));
    expect(back.type).toBe(b.type);
    expect(back.format).toEqual(b.format);
    for (const [k, v] of Object.entries(b.properties)) expect(back.properties[k]).toEqual(v);
  });

  it("nests children and skips child pages", () => {
    const parent = block({ id: "parent", type: "toggle", content: ["kid", "sub"] });
    const byId = new Map([
      ["kid", block({ id: "kid", type: "text", parent_id: "parent" })],
      ["sub", block({ id: "sub", type: "page", parent_id: "parent" })],
    ]);
    const out = toEditorBlock(parent, byId);
    expect(out.children?.map((c) => c.id)).toEqual(["kid"]);
  });
});

describe("diffPage", () => {
  const page = block({ id: "page", type: "page", parent_id: "s", parent_table: "space", content: ["a", "b", "child-page"] });
  const a = block({ id: "a", type: "text", properties: { title: [{ text: "A" }] } });
  const b = block({ id: "b", type: "text", properties: { title: [{ text: "B" }] } });
  const stored = new Map([
    ["a", a],
    ["b", b],
  ]);
  const doc = (...blocks: Block[]) => blocks.map((x) => asEditorBlock(toEditorBlock(x, new Map())));

  it("produces nothing when unchanged", () => {
    expect(diffPage(page, stored, doc(a, b))).toEqual([]);
  });

  it("updates only changed fields, creates new blocks, trashes removed ones and keeps child pages", () => {
    const edited = { ...a, properties: { title: [{ text: "A!" }] } };
    const fresh = block({ id: "n", type: "text", properties: { title: [{ text: "New" }] } });
    const writes = diffPage(page, stored, doc(edited, fresh), 5);
    const byId = Object.fromEntries(writes.map((w) => [w.id, w.changes.map((c) => c.path[0])]));
    expect(byId.a).toEqual(["properties", "last_edited_time"]);
    expect(byId.n).toContain("created_time");
    expect(byId.b).toEqual(["alive", "last_edited_time"]);
    const pageWrite = writes.find((w) => w.id === "page")!;
    expect(pageWrite.changes[0]!.value).toEqual(["a", "n", "child-page"]);
  });
});
