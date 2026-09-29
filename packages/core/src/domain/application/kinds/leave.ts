import { sameData } from "../canonical";
import { defineKind } from "../kind";
import {
  type MembershipKind,
  type MembershipTarget,
  membershipSnapshot,
  membershipSubjects,
  membershipTargetOf,
  regionSeat,
  stewardPremises,
} from "./affiliation";

export type LeaveTarget = MembershipTarget<"leave">;

/**
 * The leave kind: no content. Premises: an individual's place has no
 * steward, a place's own application has one, and the place is still
 * affiliated with the region (I-19). An individual leaves only a region
 * viewers see among the place's regions, so the place and the region must
 * be viewable; a steward may leave any region, an unpublished or
 * suspended one included, so nothing must be. The region's stewards decide
 * it (the operator for a region without one).
 */
export type LeaveKind = MembershipKind<"leave", "affiliated">;

export const leave = defineKind<LeaveKind>({
  kind: "leave",
  seat: "steward",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    ...stewardPremises,
    { key: "affiliated", holds: (facts) => facts.affiliated },
  ],
  seatOf: regionSeat,
  slotOf: (target) => target,
  submissionTargets: (target) =>
    target.applicant.kind === "individual"
      ? [
          { kind: "place", id: target.placeId },
          { kind: "region", id: target.regionId },
        ]
      : [],
  subjects: (c) => membershipSubjects(c.target),
  reflectedRef: (c) => ({ kind: "region", id: c.target.regionId }),
  registrationOf: () => null,
  contentNames: () => [],
  ownedPhotoIds: () => [],
  matchesSubmission: (c, request) => sameData(c.target, request.target),
  snapshot: (c) => membershipSnapshot(c.target),
  reconstruct: (snapshot) => ({
    target: membershipTargetOf(snapshot, "leave"),
    content: null,
  }),
});
