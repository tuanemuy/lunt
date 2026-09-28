import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import {
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
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

/** 情報修正 (営業状況の変更を含む) of a place without a steward. */
export type RevisionTarget = Readonly<{
  kind: "revision";
  applicant: IndividualApplicant;
  placeId: PlaceId;
}>;

/** The place's facts a revision rests on. */
export type PlaceStewardFacts = Readonly<{ placeHasSteward: boolean }>;

/**
 * The revision kind: only the changed items (`PlaceRevision`, from
 * `FieldPatch.between` of the place at submission and `desired`), and the
 * whole desired state the idempotent resend compares. Premise: the place
 * has no steward. Its place must be viewable; one active revision per
 * applicant and place. The operator decides it.
 */
export type RevisionKind = {
  target: RevisionTarget;
  content: PlaceRevision;
  reserved: None;
  desired: Readonly<{ desired: PlaceState }>;
  premiseKey: "placeHasNoSteward";
  facts: PlaceStewardFacts;
  seat: "operator";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: RevisionTarget;
  request: Readonly<{ target: RevisionTarget; desired: PlaceState }>;
};

/** `PlaceState` equality: the profile (`PlaceProfile.equals`) and the operating status. */
export const samePlaceState = (a: PlaceState, b: PlaceState): boolean =>
  PlaceProfile.equals(a.profile, b.profile) &&
  a.operatingStatus === b.operatingStatus;

export const revision = defineKind<RevisionKind>({
  kind: "revision",
  seat: "operator",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    { key: "placeHasNoSteward", holds: (facts) => !facts.placeHasSteward },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "place", id: target.placeId }],
  subjects: (c) => [{ kind: "place", id: c.target.placeId }],
  reflectedRef: (c) => ({ kind: "place", id: c.target.placeId }),
  registrationOf: () => null,
  contentNames: () => [],
  ownedPhotoIds: (c) =>
    FieldPatch.addedPhotoIds(PlaceRevision.schema, c.content),
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    samePlaceState(c.desired, request.desired),
  snapshot: (c) => ({
    target: {
      kind: "revision",
      applicant: { ...c.target.applicant },
      placeId: c.target.placeId,
    },
    content: Codec.placeRevision.encode(c.content),
    desired: Codec.placeState.encode(c.desired),
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "revision");
    return {
      target: {
        kind: "revision",
        applicant: individualOf(target.applicant),
        placeId: Codec.placeId(text(target.placeId)),
      },
      content: Codec.placeRevision.decode(raw.content),
      desired: Codec.placeState.decode(raw.desired),
    };
  },
});
