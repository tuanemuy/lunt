import type { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PlaceProfile } from "@repo/core/domain/place/profile";
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

/** 店舗の新規登録: an individual asks for a new place to be registered. */
export type RegistrationTarget = Readonly<{
  kind: "registration";
  applicant: IndividualApplicant;
}>;

/**
 * The registration kind (`spec/domains/application.md` 「CaseFields」): the
 * place's whole profile, and the place id reserved at submission that the
 * approval registers the place under. No premises, no viewable targets,
 * no slot (the same place may be applied for repeatedly); the operator
 * decides it.
 */
export type RegistrationKind = {
  target: RegistrationTarget;
  content: PlaceProfile;
  reserved: Readonly<{ reservedPlaceId: PlaceId }>;
  desired: None;
  premiseKey: never;
  facts: None;
  seat: "operator";
  awaitsRegistration: false;
  appointsApplicant: false;
  slot: null;
  request: Readonly<{ target: RegistrationTarget; content: PlaceProfile }>;
};

export const registration = defineKind<RegistrationKind>({
  kind: "registration",
  seat: "operator",
  awaitsRegistration: false,
  appointsApplicant: false,
  premises: [],
  seatOf: () => ({ kind: "operator" }),
  slotOf: () => null,
  submissionTargets: () => [],
  subjects: (c) => [{ kind: "place", id: c.reservedPlaceId }],
  reflectedRef: (c) => ({ kind: "place", id: c.reservedPlaceId }),
  registrationOf: () => null,
  contentNames: (c) => [
    { ref: { kind: "place", id: c.reservedPlaceId }, name: c.content.name },
  ],
  ownedPhotoIds: (c) => PhotoSet.photoIds(c.content.photos),
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    PlaceProfile.equals(c.content, request.content),
  snapshot: (c) => ({
    target: { kind: "registration", applicant: { ...c.target.applicant } },
    reservedPlaceId: c.reservedPlaceId,
    content: Codec.profile.encode(c.content),
  }),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = targetOf(raw.target, "registration");
    return {
      target: {
        kind: "registration",
        applicant: individualOf(target.applicant),
      },
      reservedPlaceId: Codec.placeId(text(raw.reservedPlaceId)),
      content: Codec.profile.decode(raw.content),
    };
  },
});
