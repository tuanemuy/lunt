import { ListingId, type PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import {
  ListingContent,
  type PublishableListingContent,
} from "@repo/core/domain/listing/content";
import type { IndividualApplicant } from "../applicant";
import { sameData } from "../canonical";
import { defineKind } from "../kind";
import {
  Codec,
  individualOf,
  type None,
  object,
  targetOf,
  text,
} from "./codec";
import type { PlaceStewardFacts } from "./revision";

/** 掲載: an individual asks for a new listing of a place without a steward. */
export type ListingTarget = Readonly<{
  kind: "listing";
  applicant: IndividualApplicant;
  placeId: PlaceId;
}>;

/**
 * The listing kind: content meeting the publish condition, and the
 * listing id reserved at submission that the approval creates the listing
 * under. Premise: the place has no steward. Its place must be viewable. No
 * slot (listings may be applied for repeatedly). The operator decides it.
 * The resend compares the entered `ListingContent`.
 */
export type ListingKind = {
  target: ListingTarget;
  content: PublishableListingContent;
  reserved: Readonly<{ reservedListingId: ListingId }>;
  desired: None;
  premiseKey: "placeHasNoSteward";
  facts: PlaceStewardFacts;
  seat: "operator";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: null;
  request: Readonly<{ target: ListingTarget; content: ListingContent }>;
};

export const listing = defineKind<ListingKind>({
  kind: "listing",
  seat: "operator",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    { key: "placeHasNoSteward", holds: (facts) => !facts.placeHasSteward },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: () => null,
  submissionTargets: (target) => [{ kind: "place", id: target.placeId }],
  subjects: (c) => [{ kind: "place", id: c.target.placeId }],
  reflectedRef: (c) => ({ kind: "listing", id: c.reservedListingId }),
  registrationOf: () => null,
  contentNames: (c) => [
    { ref: { kind: "listing", id: c.reservedListingId }, name: c.content.name },
  ],
  ownedPhotoIds: (c) => PhotoSet.photoIds(c.content.photos),
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    ListingContent.equals(c.content, request.content),
  snapshot: (c) => ({
    target: {
      kind: "listing",
      applicant: { ...c.target.applicant },
      placeId: c.target.placeId,
    },
    reservedListingId: c.reservedListingId,
    content: Codec.publishableListingContent.encode(c.content),
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "listing");
    return {
      target: {
        kind: "listing",
        applicant: individualOf(target.applicant),
        placeId: Codec.placeId(text(target.placeId)),
      },
      reservedListingId: ListingId.create(text(raw.reservedListingId)),
      content: Codec.publishableListingContent.decode(raw.content),
    };
  },
});
