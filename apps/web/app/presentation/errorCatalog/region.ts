import type { RegionErrorCode } from "@repo/core/domain/region/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Region business error is shown (CS-08 / CS-10). */
export const regionErrorCatalog = {} satisfies Record<
  RegionErrorCode,
  BusinessErrorPresentation
>;
