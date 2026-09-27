import type { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Media business error is shown (CS-08 / CS-10). */
export const mediaErrorCatalog = {} satisfies Record<
  MediaErrorCode,
  BusinessErrorPresentation
>;
