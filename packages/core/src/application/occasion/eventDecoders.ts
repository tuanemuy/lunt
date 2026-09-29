import type { EventDecoder } from "@repo/core/domain/common/event";
import { OccasionId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { OccasionEvent } from "@repo/core/domain/occasion/events";
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
        "Stored occasion event holds an invalid value",
        error,
      );
    }
  };

const ofOccasion = z.object({ occasionId: z.string() }).strict();

const toOccasion = intact((p: z.infer<typeof ofOccasion>) => ({
  occasionId: OccasionId.create(p.occasionId),
}));

const ofPlace = z.object({ occasionId: z.string(), placeId: z.string() });

const toPlace = (p: z.infer<typeof ofPlace>) => ({
  occasionId: OccasionId.create(p.occasionId),
  placeId: PlaceId.create(p.placeId),
});

const ofRegion = z
  .object({ occasionId: z.string(), regionId: z.string() })
  .strict();

const toRegion = intact((p: z.infer<typeof ofRegion>) => ({
  occasionId: OccasionId.create(p.occasionId),
  regionId: RegionId.create(p.regionId),
}));

type OccasionEventDecoders = {
  readonly [K in OccasionEvent["type"]]: EventDecoder<
    Extract<OccasionEvent, { type: K }>
  >;
};

/** Decoders of Occasion's events as stored in the outbox. */
export const occasionEventDecoders: OccasionEventDecoders = {
  "occasion.period_changed": buildEventDecoder(
    "occasion.period_changed",
    ofOccasion,
    toOccasion,
  ),
  "occasion.unpublished": buildEventDecoder(
    "occasion.unpublished",
    z
      .object({
        occasionId: z.string(),
        reason: z.enum(["byManager", "photoTakedown"]),
      })
      .strict(),
    intact((p) => ({
      occasionId: OccasionId.create(p.occasionId),
      reason: p.reason,
    })),
  ),
  "occasion.cancelled": buildEventDecoder(
    "occasion.cancelled",
    ofOccasion,
    toOccasion,
  ),
  "occasion.ended": buildEventDecoder(
    "occasion.ended",
    z.object({ occasionId: z.string(), observedOn: z.string() }).strict(),
    intact((p) => ({
      occasionId: OccasionId.create(p.occasionId),
      observedOn: LocalDate.parse(p.observedOn),
    })),
  ),
  "occasion.suspended": buildEventDecoder(
    "occasion.suspended",
    ofOccasion,
    toOccasion,
  ),
  "occasion.unsuspended": buildEventDecoder(
    "occasion.unsuspended",
    ofOccasion,
    toOccasion,
  ),
  "occasion.participation_established": buildEventDecoder(
    "occasion.participation_established",
    ofPlace.strict(),
    intact(toPlace),
  ),
  "occasion.participation_changed": buildEventDecoder(
    "occasion.participation_changed",
    ofPlace.extend({ changedBy: z.enum(["place", "occasion"]) }).strict(),
    intact((p) => ({ ...toPlace(p), changedBy: p.changedBy })),
  ),
  "occasion.participation_dissolved": buildEventDecoder(
    "occasion.participation_dissolved",
    ofPlace.extend({ cause: z.enum(["withdrawn", "excluded"]) }).strict(),
    intact((p) => ({ ...toPlace(p), cause: p.cause })),
  ),
  "occasion.region_linked": buildEventDecoder(
    "occasion.region_linked",
    ofRegion,
    toRegion,
  ),
  "occasion.region_link_detached": buildEventDecoder(
    "occasion.region_link_detached",
    ofRegion,
    toRegion,
  ),
};
