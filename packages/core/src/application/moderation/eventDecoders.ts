import type { EventDecoder } from "@repo/core/domain/common/event";
import {
  InfoReportId,
  ListingId,
  PhotoId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { PhotosTakenDownEvent } from "@repo/core/domain/common/photoEvents";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ModerationEvent } from "@repo/core/domain/moderation/events";
import type { InfoReportTarget } from "@repo/core/domain/moderation/values";
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
        "Stored moderation event holds an invalid value",
        error,
      );
    }
  };

const claimOnly = z.object({ claimId: z.string() }).strict();
const toClaimOnly = intact((p: z.infer<typeof claimOnly>) => ({
  claimId: TakedownClaimId.create(p.claimId),
}));

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeId: z.string() }).strict(),
  z
    .object({
      kind: z.literal("listing"),
      placeId: z.string(),
      listingId: z.string(),
    })
    .strict(),
]);

const toTarget = (p: z.infer<typeof targetSchema>): InfoReportTarget =>
  p.kind === "place"
    ? { kind: "place", placeId: PlaceId.create(p.placeId) }
    : {
        kind: "listing",
        placeId: PlaceId.create(p.placeId),
        listingId: ListingId.create(p.listingId),
      };

type ModerationEventDecoders = {
  readonly [K in ModerationEvent["type"]]: EventDecoder<
    Extract<ModerationEvent, { type: K }>
  >;
};

/** Decoders of Moderation's events as stored in the outbox. */
export const moderationEventDecoders: ModerationEventDecoders = {
  "takedown_claim.submitted": buildEventDecoder(
    "takedown_claim.submitted",
    claimOnly,
    toClaimOnly,
  ),
  "takedown_claim.resolved": buildEventDecoder(
    "takedown_claim.resolved",
    claimOnly,
    toClaimOnly,
  ),
  "info_report.submitted": buildEventDecoder(
    "info_report.submitted",
    z.object({ reportId: z.string() }).strict(),
    intact((p) => ({ reportId: InfoReportId.create(p.reportId) })),
  ),
  "info_report.confirmation_requested": buildEventDecoder(
    "info_report.confirmation_requested",
    z.object({ reportId: z.string(), target: targetSchema }).strict(),
    intact((p) => ({
      reportId: InfoReportId.create(p.reportId),
      target: toTarget(p.target),
    })),
  ),
};

type ContentPhotoEventDecoders = {
  readonly "content.photos_taken_down": EventDecoder<PhotosTakenDownEvent>;
};

/**
 * Decoder of the shared kernel's `content.photos_taken_down`. The photo
 * owning aggregates draft it; only Moderation's `takeDownPhotosByClaim`
 * stores it, so it registers here.
 */
export const contentPhotoEventDecoders: ContentPhotoEventDecoders = {
  "content.photos_taken_down": buildEventDecoder(
    "content.photos_taken_down",
    z
      .object({
        owner: z.object({ kind: z.string(), id: z.string() }).strict(),
        photoIds: z.array(z.string()),
        unpublished: z.boolean(),
      })
      .strict(),
    intact((p) => {
      if (!ContentRef.isKind(p.owner.kind)) {
        throw new Error(`Unknown content kind: ${p.owner.kind}`);
      }
      return {
        owner: ContentRef.create(p.owner.kind, p.owner.id),
        photoIds: p.photoIds.map((id) => PhotoId.create(id)),
        unpublished: p.unpublished,
      };
    }),
  ),
};
