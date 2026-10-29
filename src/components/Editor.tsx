import { useEffect, useMemo, useRef } from "react";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { en } from "@blocknote/core/locales";
import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import type { Block } from "@lumen/shared/schema/client";
import { isEditorBlock, toEditorBlock } from "@lumen/shared/editor";
import { applyRemoteUpdate, filterSlashItems, lumenSchema, slashItems, snapshot, type SlashItem, type Snapshot } from "@lumen/shared/editor/blocknote";
import type { PageSession } from "../data/workspace";
import { useAmbient } from "../ambient/AmbientProvider";
import { SlashMenu } from "./SlashMenu";

const SAVE_DELAY = 400;
const MAX_IMAGE_SIDE = 1800;

export type LumenEditor = BlockNoteEditor<typeof lumenSchema.blockSchema, typeof lumenSchema.inlineContentSchema, typeof lumenSchema.styleSchema>;

interface Props {
  page: Block;
  session: PageSession;
  /** False for people who can only view the page. */
  editable: boolean;
  onReady?: (editor: LumenEditor) => void;
  onWords?: (words: number) => void;
}

/** Images are stored in the page (no file storage yet), so large photos are scaled down first. */
async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900_000) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/webp", 0.86);
}

const countWords = (editor: LumenEditor) => {
  let words = 0;
  const visit = (blocks: LumenEditor["document"]) => {
    for (const b of blocks) {
      if (Array.isArray(b.content)) for (const c of b.content) if (c.type === "text") words += c.text.split(/\s+/).filter(Boolean).length;
      visit(b.children);
    }
  };
  visit(editor.document);
  return words;
};

export function Editor({ page, session, editable, onReady, onWords }: Props) {
  const { blocks } = session;
  const { theme } = useAmbient();
  const initialContent = useMemo(() => {
    const top = page.content
      .map((id) => blocks.get(id))
      .filter((b): b is Block => !!b && isEditorBlock(b.type))
      .map((b) => toEditorBlock(b, blocks));
    return top.length ? (top as PartialBlock[]) : undefined;
    // Only the first render matters: the editor owns the document afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useCreateBlockNote(
    {
      schema: lumenSchema,
      initialContent: initialContent as never,
      uploadFile: imageToDataUrl,
      dictionary: {
        ...en,
        placeholders: { ...en.placeholders, default: "Write, or press / for blocks", emptyDocument: "Start writing, or press / for blocks" },
      },
    },
    [],
  );
  const timer = useRef<number>(undefined);
  const dirty = useRef(false);
  // The blocks as last saved or received; anything else in the editor is unsaved typing.
  const known = useRef<Snapshot>(new Map());
  const applyingRemote = useRef(false);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    known.current = snapshot(editor);
    session.save(editor.document as never).catch(console.error);
  };

  useEffect(() => {
    onReady?.(editor);
    onWords?.(countWords(editor));
    known.current = snapshot(editor);
    // Other devices' edits show up as they arrive.
    const offRemote = session.onRemote((update) => {
      applyingRemote.current = true;
      try {
        known.current = applyRemoteUpdate(editor, update, known.current);
      } finally {
        applyingRemote.current = false;
      }
      onWords?.(countWords(editor));
    });
    // Save when leaving the page or closing the window.
    window.addEventListener("beforeunload", flush);
    return () => {
      offRemote();
      window.removeEventListener("beforeunload", flush);
      flush();
      session.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={theme.dark ? "dark" : "light"}
      slashMenu={false}
      emojiPicker={false}
      onChange={() => {
        if (applyingRemote.current) return;
        dirty.current = true;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          flush();
          onWords?.(countWords(editor));
        }, SAVE_DELAY);
      }}
    >
      <SuggestionMenuController<(query: string) => Promise<SlashItem[]>>
        triggerCharacter="/"
        getItems={async (query) => filterSlashItems(slashItems(editor), query)}
        suggestionMenuComponent={SlashMenu}
        onItemClick={(item) => item.onItemClick()}
      />
    </BlockNoteView>
  );
}
