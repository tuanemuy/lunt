import type { ApplicationErrorCode } from "@repo/core/domain/application/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Application business error is shown (CS-08 / CS-10). */
export const applicationErrorCatalog = {} satisfies Record<
  ApplicationErrorCode,
  BusinessErrorPresentation
>;
