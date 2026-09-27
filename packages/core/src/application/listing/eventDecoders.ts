import type { EventDecoder } from "@repo/core/domain/common/event";
import { CategoryId, ListingId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  CategoryEvent,
  ListingEvent,
} from "@repo/core/domain/listing/events";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import { buildEventDecoder } from "../events/buildDecoder";

/** A value that fails its value object is corrupt data, not a user error. */
const intact =
  <P, R>(rehydrate: (parsed: P) => R) =>
  (parsed: P): R => {
    try {
      return rehydrate(parsed);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored listing event holds an invalid value",
        error,
      );
    }
  };

const listingAtPlace = z
  .object({ listingId: z.string(), placeId: z.string() })
  .strict();

const toListingAtPlace = intact((p: z.infer<typeof listingAtPlace>) => ({
  listingId: ListingId.create(p.listingId),
  placeId: PlaceId.create(p.placeId),
}));

type ListingEventDecoders = {
  readonly [K in (ListingEvent | CategoryEvent)["type"]]: EventDecoder<
    Extract<ListingEvent | CategoryEvent, { type: K }>
  >;
};

/** Decoders of Listing's events (listing and category) as stored in the outbox. */
export const listingEventDecoders: ListingEventDecoders = {
  "listing.unpublished": buildEventDecoder(
    "listing.unpublished",
    z
      .object({
        listingId: z.string(),
        reason: z.enum(["byManager", "photoTakedown"]),
      })
      .strict(),
    intact((p) => ({
      listingId: ListingId.create(p.listingId),
      reason: p.reason,
    })),
  ),
  "listing.suspended": buildEventDecoder(
    "listing.suspended",
    listingAtPlace,
    toListingAtPlace,
  ),
  "listing.unsuspended": buildEventDecoder(
    "listing.unsuspended",
    listingAtPlace,
    toListingAtPlace,
  ),
  "listing.deleted": buildEventDecoder(
    "listing.deleted",
    z.object({ listingId: z.string() }).strict(),
    intact((p) => ({ listingId: ListingId.create(p.listingId) })),
  ),
  "listing.offering_ended": buildEventDecoder(
    "listing.offering_ended",
    z.object({ listingId: z.string(), observedOn: z.string() }).strict(),
    intact((p) => ({
      listingId: ListingId.create(p.listingId),
      observedOn: LocalDate.parse(p.observedOn),
    })),
  ),
  "category.retired": buildEventDecoder(
    "category.retired",
    z.object({ categoryId: z.string() }).strict(),
    intact((p) => ({ categoryId: CategoryId.create(p.categoryId) })),
  ),
};
