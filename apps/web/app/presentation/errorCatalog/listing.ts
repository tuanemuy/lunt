import type { ListingErrorCode } from "@repo/core/domain/listing/errorCode";
import type { BusinessErrorPresentation } from "./presentation";

/** How each Listing business error is shown (CS-08 / CS-10). */
export const listingErrorCatalog = {} satisfies Record<
  ListingErrorCode,
  BusinessErrorPresentation
>;
