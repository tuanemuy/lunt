import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { ListingId, type PlaceId } from "@repo/core/domain/common/ids";
import { ListingContent } from "@repo/core/domain/listing/content";
import { ListingPatch } from "@repo/core/domain/listing/patch";
import type { IndividualApplicant } from "../applicant";
import { sameData } from "../canonical";
import { defineKind } from "../kind";
import { Codec, individualOf, object, targetOf, text } from "./codec";
import type { PlaceStewardFacts } from "./revision";

/**
 * 掲載の修正 of a listing of a place without a steward. The target names
 * only the listing; its place is read with the listing and kept in the
 * case (`placeId`).
 */
export type ListingRevisionTarget = Readonly<{
  kind: "listingRevision";
  applicant: IndividualApplicant;
  listingId: ListingId;
}>;

export type ListingRevisionFacts = Readonly<{
  /** The listing, with its place's steward fact; `null` when it does not exist. */
  listing: PlaceStewardFacts | null;
}>;

/**
 * The listing revision kind: only the changed items (`ListingPatch`, from
 * `FieldPatch.between` of the listing at submission and `desired`), the
 * whole desired content the idempotent resend compares, and the listing's
 * place. Premises: the listing's place has no steward, the listing
 * exists. The listing must be viewable; one active revision per applicant
 * and listing. The operator decides it.
 */
export type ListingRevisionKind = {
  target: ListingRevisionTarget;
  content: ListingPatch;
  reserved: Readonly<{ placeId: PlaceId }>;
  desired: Readonly<{ desired: ListingContent }>;
  premiseKey: "placeHasNoSteward" | "listingExists";
  facts: ListingRevisionFacts;
  seat: "operator";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: ListingRevisionTarget;
  request: Readonly<{ target: ListingRevisionTarget; desired: ListingContent }>;
};

export const listingRevision = defineKind<ListingRevisionKind>({
  kind: "listingRevision",
  seat: "operator",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    {
      key: "placeHasNoSteward",
      holds: (facts) =>
        facts.listing === null || !facts.listing.placeHasSteward,
    },
    { key: "listingExists", holds: (facts) => facts.listing !== null },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "listing", id: target.listingId }],
  subjects: (c) => [
    { kind: "place", id: c.placeId },
    { kind: "listing", id: c.target.listingId },
  ],
  reflectedRef: (c) => ({ kind: "listing", id: c.target.listingId }),
  registrationOf: () => null,
  contentNames: () => [],
  ownedPhotoIds: (c) =>
    FieldPatch.addedPhotoIds(ListingPatch.schema, c.content),
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    ListingContent.equals(c.desired, request.desired),
  snapshot: (c) => ({
    target: {
      kind: "listingRevision",
      applicant: { ...c.target.applicant },
      listingId: c.target.listingId,
    },
    placeId: c.placeId,
    content: Codec.listingPatch.encode(c.content),
    desired: Codec.listingContent.encode(c.desired),
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "listingRevision");
    return {
      target: {
        kind: "listingRevision",
        applicant: individualOf(target.applicant),
        listingId: ListingId.create(text(target.listingId)),
      },
      placeId: Codec.placeId(text(raw.placeId)),
      content: Codec.listingPatch.decode(raw.content),
      desired: Codec.listingContent.decode(raw.desired),
    };
  },
});
