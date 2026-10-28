import { lumen } from "../db/client";

export { pageTitle, type PageNode, type SearchHit } from "@lumen/shared/client";
export const {
  getSpace,
  pageTree,
  getBlock,
  loadPageBlocks,
  savePage,
  createPage,
  renamePage,
  setPageIcon,
  setPageAlive,
  trashedPages,
  search,
  onChange,
} = lumen;
