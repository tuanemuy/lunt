import { ApplicationId, type PlaceId } from "@repo/core/domain/common/ids";
import type { IndividualApplicant } from "../applicant";
import { sameData } from "../canonical";
import { defineKind } from "../kind";
import type { ApplicationStatusKind } from "../status";
import { StewardshipClaim } from "../stewardshipClaim";
import {
  Codec,
  individualOf,
  type None,
  object,
  targetOf,
  text,
} from "./codec";

/**
 * 管理権限: an individual claims to steward a place. `registrationId` is
 * the registration the claim was filed with (M-45) while that
 * registration is not approved; `null` otherwise.
 */
export type StewardshipTarget = Readonly<{
  kind: "stewardship";
  applicant: IndividualApplicant;
  placeId: PlaceId;
  registrationId: ApplicationId | null;
}>;

/** A claim's slot: the applicant and the place, never the registration. */
export type StewardshipSlot = Readonly<{
  kind: "stewardship";
  applicant: IndividualApplicant;
  placeId: PlaceId;
}>;

export type StewardshipFacts = Readonly<{
  applicantIsSteward: boolean;
  /** The companion registration's status; `null` without one. */
  registration: ApplicationStatusKind | null;
}>;

/**
 * The stewardship kind: a `StewardshipClaim`. Premises: the applicant is
 * not a steward of the place, and — for a claim filed with a registration
 * — that registration stands. Only an ordinary claim names its place as a
 * target that must be viewable. The operator decides it, after the
 * companion registration; approval appoints the applicant.
 */
export type StewardshipKind = {
  target: StewardshipTarget;
  content: StewardshipClaim;
  reserved: None;
  desired: None;
  premiseKey: "applicantNotSteward" | "registrationStanding";
  facts: StewardshipFacts;
  seat: "operator";
  awaitsRegistration: true;
  appointsApplicant: true;
  slot: StewardshipSlot;
  request: Readonly<{ target: StewardshipTarget; content: StewardshipClaim }>;
};

export const stewardship = defineKind<StewardshipKind>({
  kind: "stewardship",
  seat: "operator",
  awaitsRegistration: true,
  appointsApplicant: true,
  premises: [
    { key: "applicantNotSteward", holds: (facts) => !facts.applicantIsSteward },
    {
      key: "registrationStanding",
      appliesTo: (target) => target.registrationId !== null,
      holds: (facts) =>
        facts.registration === "underReview" ||
        facts.registration === "returned" ||
        facts.registration === "approved",
    },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => ({
    kind: "stewardship",
    applicant: target.applicant,
    placeId: target.placeId,
  }),
  submissionTargets: (target) =>
    target.registrationId === null
      ? [{ kind: "place", id: target.placeId }]
      : [],
  subjects: (c) =>
    c.target.registrationId === null
      ? [{ kind: "place", id: c.target.placeId }]
      : [
          { kind: "place", id: c.target.placeId },
          { kind: "registration", id: c.target.registrationId },
        ],
  reflectedRef: (c) => ({ kind: "place", id: c.target.placeId }),
  registrationOf: (target) => target.registrationId,
  contentNames: () => [],
  ownedPhotoIds: () => [],
  // The registration is not compared: once it is approved, the same
  // request builds a target without it (`ApplicationTarget.companion`).
  matchesSubmission: (c, request) =>
    sameData(c.target.applicant, request.target.applicant) &&
    c.target.placeId === request.target.placeId &&
    StewardshipClaim.equals(c.content, request.content),
  snapshot: (c) => ({
    target: {
      kind: "stewardship",
      applicant: { ...c.target.applicant },
      placeId: c.target.placeId,
      registrationId: c.target.registrationId,
    },
    content: {
      relationship: c.content.relationship,
      evidence: c.content.evidence,
    },
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "stewardship");
    const content = object(raw.content);
    const claim = StewardshipClaim.create({
      relationship: text(content.relationship),
      evidence: text(content.evidence),
    });
    if (
      claim.relationship !== content.relationship ||
      claim.evidence !== content.evidence
    ) {
      throw new Error("A stored claim is not normalized");
    }
    return {
      target: {
        kind: "stewardship",
        applicant: individualOf(target.applicant),
        placeId: Codec.placeId(text(target.placeId)),
        registrationId:
          target.registrationId === null
            ? null
            : ApplicationId.create(text(target.registrationId)),
      },
      content: claim,
    };
  },
});
