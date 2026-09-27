import type { PlaceErrorCode } from "@repo/core/domain/place/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Place business error is shown (CS-08 / CS-10). */
export const placeErrorCatalog = {} satisfies Record<
  PlaceErrorCode,
  BusinessErrorPresentation
>;
