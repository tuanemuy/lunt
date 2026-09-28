import type {
  AccountId,
  ListingId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { ApplicationFor } from "./kind";
import type { ApplicationKindMap } from "./kinds";
import type { ListingTarget } from "./kinds/listing";
import type { ListingRevisionTarget } from "./kinds/listingRevision";
import type { RegistrationTarget } from "./kinds/registration";
import type { RevisionTarget } from "./kinds/revision";
import type { StewardshipTarget } from "./kinds/stewardship";

/**
 * What an individual's target is built from: the kind and the target ids
 * (a registration has none). The kinds about a place share one member,
 * so a caller holding any of them builds its input in one step. S3B adds
 * the individual's affiliation and leave.
 */
export type IndividualTargetInput =
  | Readonly<{ kind: "registration" }>
  | Readonly<{ kind: "revision" | "stewardship" | "listing"; placeId: PlaceId }>
  | Readonly<{ kind: "listingRevision"; listingId: ListingId }>;

export type IndividualKind = IndividualTargetInput["kind"];

type IndividualTargetOf = {
  registration: RegistrationTarget;
  revision: RevisionTarget;
  stewardship: StewardshipTarget;
  listing: ListingTarget;
  listingRevision: ListingRevisionTarget;
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
 * input alone, before any content. `byPlace` (a steward acting for a
 * place) arrives with the affiliation, leave and participation kinds
 * (S3B).
 */
export const ApplicationTarget = { byIndividual, companion };
