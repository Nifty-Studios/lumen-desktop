import { lumen } from "../db/client";

export { pageTitle, type PageNode, type PageSession, type SearchHit } from "@lumen/shared/client";
export const {
  getSpace,
  pageTree,
  getBlock,
  openPage,
  createPage,
  renamePage,
  setPageIcon,
  setPageAlive,
  trashedPages,
  search,
  onChange,
} = lumen;
