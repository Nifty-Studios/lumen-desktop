import { lumen } from "../db/client";

export { isGroup, pageTitle, type PageNode, type PageSession, type RemoteUpdate, type SearchHit } from "@lumen/shared/client";
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
  createGroup,
  movePage,
  renamePage,
  setPageIcon,
  setPageAlive,
  trashedPages,
  search,
  onChange,
} = lumen;
