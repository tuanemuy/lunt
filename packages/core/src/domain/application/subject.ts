import type {
  ApplicationId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";

/**
 * A place, region, occasion, listing or registration an application is
 * about (関わる対象, `Application.subjects`). A `registration` subject links
 * a companion stewardship claim to the registration it was filed with.
 */
export type ApplicationSubject =
  | Readonly<{ kind: "place"; id: PlaceId }>
  | Readonly<{ kind: "region"; id: RegionId }>
  | Readonly<{ kind: "occasion"; id: OccasionId }>
  | Readonly<{ kind: "listing"; id: ListingId }>
  | Readonly<{ kind: "registration"; id: ApplicationId }>;

export type ApplicationSubjectKind = ApplicationSubject["kind"];

/** A target that must be viewable for a new application to be accepted. */
export type SubmissionTarget = Extract<
  ContentRef,
  { kind: "place" | "listing" | "region" | "occasion" }
>;

export const ApplicationSubject = {
  kinds: [
    "place",
    "region",
    "occasion",
    "listing",
    "registration",
  ] as const satisfies readonly ApplicationSubjectKind[],
  key: (subject: ApplicationSubject): string => `${subject.kind}:${subject.id}`,
};
