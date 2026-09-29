import type { OccasionErrorCode } from "@repo/core/domain/occasion/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Occasion business error is shown (CS-08 / CS-10). */
export const occasionErrorCatalog = {} satisfies Record<
  OccasionErrorCode,
  BusinessErrorPresentation
>;
