import {
  ListingId,
  OccasionId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import { ParticipationDetails } from "@repo/core/domain/occasion/participation";
import type { PlaceApplicant } from "../applicant";
import { sameData } from "../canonical";
import { defineKind } from "../kind";
import {
  Codec,
  list,
  type None,
  object,
  placeApplicantOf,
  targetOf,
  text,
} from "./codec";

/** 参加: a place, as its steward, takes part in an occasion (E-05). */
export type ParticipationTarget = Readonly<{
  kind: "participation";
  applicant: PlaceApplicant;
  placeId: PlaceId;
  occasionId: OccasionId;
}>;

export type ParticipationFacts = Readonly<{
  placeHasSteward: boolean;
  /** The occasion's holding status today; `null` without a period or an occasion. */
  holdingStatus: HoldingStatus | null;
  /** The place already takes part (`ParticipationRepository.findById`). */
  participating: boolean;
}>;

/** An idempotent resend compares the entered listings and dates. */
export type ParticipationRequest = Readonly<{
  target: ParticipationTarget;
  listingIds: readonly ListingId[];
  dates: readonly LocalDate[];
}>;

/**
 * The participation kind: the attached listings and days
 * (`ParticipationDetails`, built at submission against the holding period
 * and the place's attachable listings). Premises: the place has a steward,
 * the occasion has neither ended nor been cancelled, and the place does
 * not take part yet. The occasion must be viewable. The occasion's
 * stewards decide it (the operator for an occasion without one).
 */
export type ParticipationKind = {
  target: ParticipationTarget;
  content: ParticipationDetails;
  reserved: None;
  desired: None;
  premiseKey: "placeHasSteward" | "occasionOpen" | "notParticipating";
  facts: ParticipationFacts;
  seat: "steward";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: ParticipationTarget;
  request: ParticipationRequest;
};

const uniqueInOrder = <T>(items: readonly T[]): readonly T[] => [
  ...new Set(items),
];

/** The entered listings and days as `ParticipationDetails.create` normalizes them. */
const normalized = (
  listingIds: readonly ListingId[],
  dates: readonly LocalDate[],
): ParticipationDetails => ({
  listingIds: uniqueInOrder(listingIds),
  dates: [...uniqueInOrder(dates)].sort(LocalDate.compare),
});

export const participation = defineKind<ParticipationKind>({
  kind: "participation",
  seat: "steward",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    { key: "placeHasSteward", holds: (facts) => facts.placeHasSteward },
    {
      key: "occasionOpen",
      holds: (facts) =>
        facts.holdingStatus !== "ended" && facts.holdingStatus !== "cancelled",
    },
    { key: "notParticipating", holds: (facts) => !facts.participating },
  ],
  seatOf: (target) => ({
    kind: "steward",
    target: { kind: "occasion", id: target.occasionId },
  }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "occasion", id: target.occasionId }],
  subjects: (c) => [
    { kind: "place", id: c.target.placeId },
    { kind: "occasion", id: c.target.occasionId },
  ],
  reflectedRef: (c) => ({ kind: "occasion", id: c.target.occasionId }),
  registrationOf: () => null,
  contentNames: () => [],
  ownedPhotoIds: () => [],
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    ParticipationDetails.equals(
      c.content,
      normalized(request.listingIds, request.dates),
    ),
  snapshot: (c) => ({
    target: {
      kind: "participation",
      applicant: { ...c.target.applicant },
      placeId: c.target.placeId,
      occasionId: c.target.occasionId,
    },
    content: {
      listingIds: [...c.content.listingIds],
      dates: [...c.content.dates],
    },
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "participation");
    const placeId = Codec.placeId(target.placeId);
    const content = object(raw.content);
    const listingIds = list(content.listingIds).map((id) =>
      ListingId.create(text(id)),
    );
    const dates = list(content.dates).map((day) => LocalDate.parse(text(day)));
    const details = normalized(listingIds, dates);
    if (!ParticipationDetails.equals(details, { listingIds, dates })) {
      throw new Error("Stored participation details are not normalized");
    }
    return {
      target: {
        kind: "participation",
        applicant: placeApplicantOf(target.applicant, placeId),
        placeId,
        occasionId: OccasionId.create(text(target.occasionId)),
      },
      content: details,
    };
  },
});
