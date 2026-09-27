import type { DiscoveryErrorCode } from "@repo/core/domain/discovery/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Discovery business error is shown (CS-08 / CS-10). */
export const discoveryErrorCatalog = {} satisfies Record<
  DiscoveryErrorCode,
  BusinessErrorPresentation
>;
