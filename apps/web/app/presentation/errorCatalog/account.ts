import type { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Account business error is shown (CS-08 / CS-10). */
export const accountErrorCatalog = {} satisfies Record<
  AccountErrorCode,
  BusinessErrorPresentation
>;
