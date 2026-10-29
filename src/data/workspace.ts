import { lumen } from "../db/client";

export { pageTitle, type PageNode, type PageSession, type RemoteUpdate, type SearchHit } from "@lumen/shared/client";
export const {
  account,
  getSpace,
  listSpaces,
  setCurrentSpace,
  sharedPages,
  roleOf,
  pageTree,
  getBlock,
  childPages,
  pagePath,
  openPage,
  createPage,
  renamePage,
  setPageIcon,
  setPageAlive,
  trashedPages,
  search,
  onChange,
} = lumen;
