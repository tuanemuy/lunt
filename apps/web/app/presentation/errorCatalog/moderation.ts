import type { ModerationErrorCode } from "@repo/core/domain/moderation/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Moderation business error is shown (CS-08 / CS-10). */
export const moderationErrorCatalog = {} satisfies Record<
  ModerationErrorCode,
  BusinessErrorPresentation
>;
