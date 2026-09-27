import type { EventDraft } from "@repo/core/domain/common/event";
import type { ListingId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Version } from "@repo/core/domain/common/version";
import { ListingEvents, type ListingOfferingEndedEvent } from "./events";
import type { PublishedListing } from "./listing";
import { type OfferingPhase, OfferingStatus } from "./offering";

/**
 * The last offering phase seen for a published listing, kept outside the
 * aggregate: the listing's version when it was seen, and the next day the
 * phase changes (`OfferingStatus.nextChangeOn`, `null` when it never does).
 */
export type OfferingPhaseRecord = Readonly<{
  listingId: ListingId;
  phase: OfferingPhase;
  observedVersion: Version;
  nextChangeOn: LocalDate | null;
}>;

/**
 * Compares a published listing's phase today with the recorded one. The
 * only producer of `listing.offering_ended` (schedule and manual ends
 * alike): an end not yet recorded yields one; nothing else does — a
 * listing ended and resumed between two checks yields none.
 */
function detect(
  listing: PublishedListing,
  recorded: OfferingPhase | null,
  today: LocalDate,
  now: Date,
): Readonly<{
  record: OfferingPhaseRecord;
  eventDrafts: readonly EventDraft<ListingOfferingEndedEvent>[];
}> {
  const { offering } = listing.content;
  const phase = OfferingStatus.of(offering, listing.manualEnd, today).phase;
  return {
    record: {
      listingId: listing.id,
      phase,
      observedVersion: listing.version,
      nextChangeOn: OfferingStatus.nextChangeOn(
        offering,
        listing.manualEnd,
        today,
      ),
    },
    eventDrafts:
      phase === "ended" && recorded !== "ended"
        ? [ListingEvents.offeringEnded(listing.id, today, now)]
        : [],
  };
}

export const OfferingWatch = { detect };
