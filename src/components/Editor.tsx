import { useEffect, useMemo, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import type { Block } from "@lumen/shared/schema/client";
import { toEditorBlock, isEditorBlock } from "@lumen/shared/editor";
import type { PageSession } from "../data/workspace";
import { useColorScheme } from "../data/hooks";

const SAVE_DELAY = 400;

interface Props {
  page: Block;
  session: PageSession;
}

export function Editor({ page, session }: Props) {
  const { blocks } = session;
  const scheme = useColorScheme();
  const initialContent = useMemo(() => {
    const top = page.content
      .map((id) => blocks.get(id))
      .filter((b): b is Block => !!b && isEditorBlock(b.type))
      .map((b) => toEditorBlock(b, blocks));
    return top.length ? (top as PartialBlock[]) : undefined;
    // Only the first render matters: the editor owns the document afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useCreateBlockNote({ initialContent }, []);
  const timer = useRef<number>(undefined);
  const dirty = useRef(false);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    session.save(editor.document).catch(console.error);
  };

  // Save when leaving the page or closing the window.
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      theme={scheme}
      onChange={() => {
        dirty.current = true;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, SAVE_DELAY);
      }}
    />
  );
}
