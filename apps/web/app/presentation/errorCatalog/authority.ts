import type { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Authority business error is shown (CS-08 / CS-10). */
export const authorityErrorCatalog = {} satisfies Record<
  AuthorityErrorCode,
  BusinessErrorPresentation
>;
