import type { BookmarkErrorCode } from "@repo/core/domain/bookmark/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Bookmark business error is shown (CS-08 / CS-10). */
export const bookmarkErrorCatalog = {} satisfies Record<
  BookmarkErrorCode,
  BusinessErrorPresentation
>;
