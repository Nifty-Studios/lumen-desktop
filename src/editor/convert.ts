// BlockNote <-> Lumen block records. The editor holds one page as a tree of blocks;
// Lumen stores each block as its own record, with children as ordered ids in `content`.

import type { Block as EditorBlock, PartialBlock, StyledText, Link, Styles } from "@blocknote/core";
import type { BlockFormat, BlockProperties, BlockType, Mark, RichText, TextSpan } from "@lumen/shared";
import { plainText, richText } from "@lumen/shared";
import type { Block } from "@lumen/shared/schema/client";

type InlineContent = (StyledText<any> | Link<any>)[];

// ---- inline text ------------------------------------------------------------

const STYLE_MARKS = ["bold", "italic", "underline", "strike", "code"] as const;

function stylesToMarks(styles: Styles<any>, href?: string): Mark[] {
  const marks: Mark[] = [];
  for (const type of STYLE_MARKS) if (styles[type]) marks.push({ type });
  if (typeof styles.textColor === "string" && styles.textColor !== "default")
    marks.push({ type: "color", value: styles.textColor });
  if (typeof styles.backgroundColor === "string" && styles.backgroundColor !== "default")
    marks.push({ type: "background", value: styles.backgroundColor });
  if (href) marks.push({ type: "link", value: href });
  return marks;
}

function span(text: string, marks: Mark[]): TextSpan {
  return marks.length ? { text, marks } : { text };
}

export function inlineToRichText(content: InlineContent | undefined): RichText {
  const out: RichText = [];
  for (const item of content ?? []) {
    if (item.type === "text") out.push(span(item.text, stylesToMarks(item.styles)));
    else if (item.type === "link")
      for (const t of item.content) out.push(span(t.text, stylesToMarks(t.styles, item.href)));
  }
  return out;
}

function marksToStyles(marks: Mark[] = []): Styles<any> {
  const styles: Record<string, string | boolean> = {};
  for (const m of marks) {
    if (m.type === "color" && m.value) styles.textColor = m.value;
    else if (m.type === "background" && m.value) styles.backgroundColor = m.value;
    else if (m.type !== "link") styles[m.type] = true;
  }
  return styles as Styles<any>;
}

export function richTextToInline(rt: RichText | undefined): InlineContent {
  const out: InlineContent = [];
  for (const s of rt ?? []) {
    const href = s.marks?.find((m) => m.type === "link")?.value;
    const text: StyledText<any> = { type: "text", text: s.text, styles: marksToStyles(s.marks) };
    const last = out[out.length - 1];
    if (href && last?.type === "link" && last.href === href) last.content.push(text);
    else if (href) out.push({ type: "link", href, content: [text] });
    else out.push(text);
  }
  return out;
}

// ---- blocks -----------------------------------------------------------------

const HEADING_TYPES: BlockType[] = ["header", "sub_header", "sub_sub_header"];

const TO_EDITOR: Partial<Record<BlockType, string>> = {
  text: "paragraph",
  bulleted_list: "bulletListItem",
  numbered_list: "numberedListItem",
  to_do: "checkListItem",
  toggle: "toggleListItem",
  quote: "quote",
  code: "codeBlock",
  divider: "divider",
  image: "image",
};

const FROM_EDITOR: Record<string, BlockType> = Object.fromEntries(
  Object.entries(TO_EDITOR).map(([lumen, editor]) => [editor, lumen as BlockType]),
);

/** Block types the editor can show. Others (child pages, databases) stay out of the editor. */
export const isEditorBlock = (type: BlockType) => type in TO_EDITOR || HEADING_TYPES.includes(type);

function formatToProps(format: BlockFormat): Record<string, string> {
  const props: Record<string, string> = {};
  if (format.color) props.textColor = format.color;
  if (format.background) props.backgroundColor = format.background;
  if (format.align) props.textAlignment = format.align;
  return props;
}

export function toEditorBlock(block: Block, byId: Map<string, Block>): PartialBlock {
  const props: Record<string, unknown> = formatToProps(block.format);
  const p = block.properties;
  let type = TO_EDITOR[block.type] ?? "paragraph";
  let content: unknown = richTextToInline(p.title);

  const headingLevel = HEADING_TYPES.indexOf(block.type);
  if (headingLevel >= 0) {
    type = "heading";
    props.level = headingLevel + 1;
  }
  switch (block.type) {
    case "to_do":
      props.checked = Boolean(p.checked);
      break;
    case "code":
      props.language = p.language ?? "text";
      content = plainText(p.title);
      break;
    case "divider":
      content = undefined;
      break;
    case "image":
      props.url = p.source ?? "";
      props.caption = plainText(p.caption);
      content = undefined;
      break;
  }

  const children = block.content
    .map((id) => byId.get(id))
    .filter((child): child is Block => !!child && child.alive && isEditorBlock(child.type))
    .map((child) => toEditorBlock(child, byId));

  return { id: block.id, type, props, content, children } as PartialBlock;
}

export interface BlockFields {
  type: BlockType;
  properties: BlockProperties;
  format: BlockFormat;
}

export function fromEditorBlock(b: EditorBlock): BlockFields {
  const props = b.props as Record<string, unknown>;
  const format: BlockFormat = {};
  if (typeof props.textColor === "string" && props.textColor !== "default") format.color = props.textColor;
  if (typeof props.backgroundColor === "string" && props.backgroundColor !== "default")
    format.background = props.backgroundColor;
  if (typeof props.textAlignment === "string" && props.textAlignment !== "left")
    format.align = props.textAlignment as BlockFormat["align"];

  let type: BlockType = FROM_EDITOR[b.type] ?? "text";
  const properties: BlockProperties = {};

  if (b.type === "heading") type = HEADING_TYPES[Math.min(Math.max(Number(props.level) || 1, 1), 3) - 1]!;

  if (b.type === "codeBlock") {
    // Typed as a string, but handle inline content too in case BlockNote hands it back that way.
    const content = b.content as unknown as string | InlineContent | undefined;
    properties.title = richText(typeof content === "string" ? content : plainText(inlineToRichText(content)));
    properties.language = String(props.language ?? "text");
  } else if (b.type === "image") {
    properties.source = String(props.url ?? "");
    properties.caption = richText(String(props.caption ?? ""));
  } else if (Array.isArray(b.content)) {
    properties.title = inlineToRichText(b.content as InlineContent);
  }
  if (b.type === "checkListItem") properties.checked = Boolean(props.checked);

  return { type, properties, format };
}
