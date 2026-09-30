import type { ArticleErrorCode } from "@repo/core/domain/article/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Article business error is shown (CS-08 / CS-10). */
export const articleErrorCatalog = {} satisfies Record<
  ArticleErrorCode,
  BusinessErrorPresentation
>;
