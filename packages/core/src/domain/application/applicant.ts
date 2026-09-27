import type { AccountId, PlaceId } from "@repo/core/domain/common/ids";

export type IndividualApplicant = Readonly<{
  kind: "individual";
  accountId: AccountId;
}>;

/**
 * An application made as a place's steward. It records the place, not the
 * steward who submitted it: every steward of the place handles it, and it
 * survives that steward's resignation or withdrawal (P-76).
 */
export type PlaceApplicant = Readonly<{ kind: "place"; placeId: PlaceId }>;

/** Who an application is from (申請者). */
export type Applicant = IndividualApplicant | PlaceApplicant;

export type ApplicantKind = Applicant["kind"];

/**
 * The person acting on an application. A usecase builds `steward` only
 * after `AccessPolicy.decide` (`act_as_place`) allowed it.
 */
export type ActingApplicant =
  | Readonly<{ kind: "individual"; accountId: AccountId }>
  | Readonly<{ kind: "steward"; accountId: AccountId; placeId: PlaceId }>;

const APPLICANT_KINDS = [
  "individual",
  "place",
] as const satisfies readonly ApplicantKind[];

function equals(a: Applicant, b: Applicant): boolean {
  if (a.kind === "individual") {
    return b.kind === "individual" && a.accountId === b.accountId;
  }
  return b.kind === "place" && a.placeId === b.placeId;
}

/**
 * Whether `acting` handles an application from `applicant`: the same
 * account for an individual's application, the same place for one made
 * as a steward.
 */
function isHandledBy(applicant: Applicant, acting: ActingApplicant): boolean {
  if (applicant.kind === "individual") {
    return (
      acting.kind === "individual" && acting.accountId === applicant.accountId
    );
  }
  return acting.kind === "steward" && acting.placeId === applicant.placeId;
}

export const Applicant = {
  kinds: APPLICANT_KINDS,
  individual: (accountId: AccountId): IndividualApplicant => ({
    kind: "individual",
    accountId,
  }),
  place: (placeId: PlaceId): PlaceApplicant => ({ kind: "place", placeId }),
  equals,
  isHandledBy,
};
