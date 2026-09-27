import type { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Area business error is shown (CS-08 / CS-10). */
export const areaErrorCatalog = {} satisfies Record<
  AreaErrorCode,
  BusinessErrorPresentation
>;
