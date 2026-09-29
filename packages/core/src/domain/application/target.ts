import type {
  AccountId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { ApplicationFor } from "./kind";
import type { ApplicationKindMap } from "./kinds";
import type { AffiliationTarget } from "./kinds/affiliation";
import type { LeaveTarget } from "./kinds/leave";
import type { ListingTarget } from "./kinds/listing";
import type { ListingRevisionTarget } from "./kinds/listingRevision";
import type { ParticipationTarget } from "./kinds/participation";
import type { RegistrationTarget } from "./kinds/registration";
import type { RevisionTarget } from "./kinds/revision";
import type { StewardshipTarget } from "./kinds/stewardship";

/**
 * What an individual's target is built from: the kind and the target ids
 * (a registration has none). The kinds about a place share one member,
 * so a caller holding any of them builds its input in one step.
 */
export type IndividualTargetInput =
  | Readonly<{ kind: "registration" }>
  | Readonly<{ kind: "revision" | "stewardship" | "listing"; placeId: PlaceId }>
  | Readonly<{
      kind: "affiliation" | "leave";
      placeId: PlaceId;
      regionId: RegionId;
    }>
  | Readonly<{ kind: "listingRevision"; listingId: ListingId }>;

export type IndividualKind = IndividualTargetInput["kind"];

/**
 * What a steward's target — filed as the place — is built from: the kind
 * and the region or occasion (the place is the steward's own).
 */
export type PlaceTargetInput =
  | Readonly<{ kind: "affiliation" | "leave"; regionId: RegionId }>
  | Readonly<{ kind: "participation"; occasionId: OccasionId }>;

export type PlaceKind = PlaceTargetInput["kind"];

type IndividualTargetOf = {
  registration: RegistrationTarget;
  revision: RevisionTarget;
  stewardship: StewardshipTarget;
  affiliation: AffiliationTarget;
  leave: LeaveTarget;
  listing: ListingTarget;
  listingRevision: ListingRevisionTarget;
};

type PlaceTargetOf = {
  affiliation: AffiliationTarget;
  leave: LeaveTarget;
  participation: ParticipationTarget;
};

function byIndividual<I extends IndividualTargetInput>(
  accountId: AccountId,
  input: I,
): IndividualTargetOf[I["kind"]];
function byIndividual(
  accountId: AccountId,
  input: IndividualTargetInput,
): IndividualTargetOf[IndividualKind] {
  const applicant = { kind: "individual", accountId } as const;
  switch (input.kind) {
    case "registration":
      return { kind: "registration", applicant };
    case "revision":
      return { kind: "revision", applicant, placeId: input.placeId };
    case "stewardship":
      return {
        kind: "stewardship",
        applicant,
        placeId: input.placeId,
        registrationId: null,
      };
    case "affiliation":
    case "leave":
      return {
        kind: input.kind,
        applicant,
        placeId: input.placeId,
        regionId: input.regionId,
      };
    case "listing":
      return { kind: "listing", applicant, placeId: input.placeId };
    case "listingRevision":
      return {
        kind: "listingRevision",
        applicant,
        listingId: input.listingId,
      };
  }
}

/**
 * `ApplicationTarget.byPlace`: a steward's application, filed as the
 * place. The applicant and the target's place are made from the same
 * `placeId`, so they always agree.
 */
function byPlace<I extends PlaceTargetInput>(
  placeId: PlaceId,
  input: I,
): PlaceTargetOf[I["kind"]];
function byPlace(
  placeId: PlaceId,
  input: PlaceTargetInput,
): PlaceTargetOf[PlaceKind] {
  const applicant = { kind: "place", placeId } as const;
  switch (input.kind) {
    case "affiliation":
    case "leave":
      return {
        kind: input.kind,
        applicant,
        placeId,
        regionId: input.regionId,
      };
    case "participation":
      return {
        kind: "participation",
        applicant,
        placeId,
        occasionId: input.occasionId,
      };
  }
}

/**
 * `ApplicationTarget.companion`: the stewardship claim that refers to
 * `registration` — its reserved place, and the registration itself while
 * it is not approved (after the approval, the same target
 * `byIndividual` builds for that place). `null` when the registration is
 * not `accountId`'s own; a usecase answers that like a missing
 * registration (`NotFoundError`).
 */
function companion(
  registration: ApplicationFor<ApplicationKindMap["registration"]>,
  accountId: AccountId,
): StewardshipTarget | null {
  const { applicant } = registration.target;
  if (applicant.accountId !== accountId) return null;
  return {
    kind: "stewardship",
    applicant,
    placeId: registration.reservedPlaceId,
    registrationId:
      registration.status.kind === "approved" ? null : registration.id,
  };
}

/**
 * Builds targets (`spec/domains/application.md` 「ApplicationTarget」) from
 * input alone, before any content.
 */
export const ApplicationTarget = { byIndividual, byPlace, companion };
