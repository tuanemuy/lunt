import { type PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { Applicant } from "../applicant";
import { sameData } from "../canonical";
import { defineKind, type JsonValue } from "../kind";
import type { PremiseRule } from "../premise";
import type { ApplicationSubject } from "../subject";
import {
  applicantAbout,
  Codec,
  type None,
  object,
  targetOf,
  text,
} from "./codec";

/**
 * 所属 (`affiliation`) or 離脱 (`leave`) of a place and a region. A
 * steward files it as the place (`applicant` is the place itself —
 * `ApplicationTarget.byPlace`); anyone files it as an individual for a
 * place without a steward.
 */
export type MembershipTarget<K extends "affiliation" | "leave"> = Readonly<{
  kind: K;
  applicant: Applicant;
  placeId: PlaceId;
  regionId: RegionId;
}>;

export type AffiliationTarget = MembershipTarget<"affiliation">;

/** The facts an affiliation or leave rests on. */
export type MembershipFacts = Readonly<{
  /** The place has a steward (`Stewardship.isVacant`'s negation). */
  placeHasSteward: boolean;
  /** The place and the region are affiliated (`PlaceAffiliations.has`). */
  affiliated: boolean;
}>;

/** The spec an affiliation or leave kind shares. */
export type MembershipKind<
  K extends "affiliation" | "leave",
  P extends "notAffiliated" | "affiliated",
> = {
  target: MembershipTarget<K>;
  content: null;
  reserved: None;
  desired: None;
  premiseKey: "placeHasNoSteward" | "placeHasSteward" | P;
  facts: MembershipFacts;
  seat: "steward";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: MembershipTarget<K>;
  request: Readonly<{ target: MembershipTarget<K> }>;
};

/**
 * The affiliation kind: no content. Premises: an individual's place has
 * no steward, a place's own application has one, and the place is not yet
 * affiliated with the region. An individual's place and the region must
 * be viewable; a steward's application names only the region. The
 * region's stewards decide it (the operator for a region without one).
 */
export type AffiliationKind = MembershipKind<"affiliation", "notAffiliated">;

type AnyMembership = MembershipTarget<"affiliation" | "leave">;

/** The steward premises an affiliation and a leave share, by applicant. */
export const stewardPremises: readonly PremiseRule<
  AnyMembership,
  MembershipFacts,
  "placeHasNoSteward" | "placeHasSteward"
>[] = [
  {
    key: "placeHasNoSteward",
    appliesTo: (target) => target.applicant.kind === "individual",
    holds: (facts) => !facts.placeHasSteward,
  },
  {
    key: "placeHasSteward",
    appliesTo: (target) => target.applicant.kind === "place",
    holds: (facts) => facts.placeHasSteward,
  },
];

/** The region's stewards decide it. */
export const regionSeat = (target: AnyMembership) =>
  ({
    kind: "steward",
    target: { kind: "region", id: target.regionId },
  }) as const;

export const membershipSubjects = (
  target: AnyMembership,
): readonly ApplicationSubject[] => [
  { kind: "place", id: target.placeId },
  { kind: "region", id: target.regionId },
];

export const membershipSnapshot = (target: AnyMembership): JsonValue => ({
  target: {
    kind: target.kind,
    applicant: { ...target.applicant },
    placeId: target.placeId,
    regionId: target.regionId,
  },
  content: null,
});

/** The stored target of `kind`, rebuilt; a place applicant must be its place. */
export function membershipTargetOf<K extends "affiliation" | "leave">(
  snapshot: JsonValue,
  kind: K,
): MembershipTarget<K> {
  const raw = object(snapshot);
  const target = targetOf(raw.target, kind);
  if (raw.content !== null) throw new Error(`A ${kind} has no content`);
  const placeId = Codec.placeId(target.placeId);
  return {
    kind,
    applicant: applicantAbout(target.applicant, placeId),
    placeId,
    regionId: RegionId.create(text(target.regionId)),
  };
}

export const affiliation = defineKind<AffiliationKind>({
  kind: "affiliation",
  seat: "steward",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [
    ...stewardPremises,
    { key: "notAffiliated", holds: (facts) => !facts.affiliated },
  ],
  seatOf: regionSeat,
  slotOf: (target) => target,
  submissionTargets: (target) =>
    target.applicant.kind === "individual"
      ? [
          { kind: "place", id: target.placeId },
          { kind: "region", id: target.regionId },
        ]
      : [{ kind: "region", id: target.regionId }],
  subjects: (c) => membershipSubjects(c.target),
  reflectedRef: (c) => ({ kind: "region", id: c.target.regionId }),
  registrationOf: () => null,
  contentNames: () => [],
  ownedPhotoIds: () => [],
  matchesSubmission: (c, request) => sameData(c.target, request.target),
  snapshot: (c) => membershipSnapshot(c.target),
  reconstruct: (snapshot) => ({
    target: membershipTargetOf(snapshot, "affiliation"),
    content: null,
  }),
});
