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

/** A subject that is content: every subject but a registration. */
export type ContentSubject = Exclude<
  ApplicationSubject,
  Readonly<{ kind: "registration" }>
>;

/**
 * How a subject is named (「申請の対象の名称」): from an application's
 * content (a registration's place, before and after it is created), or by
 * `ContentDirectory` at the time of reading.
 */
export type SubjectName =
  | Readonly<{ from: "content"; value: string | null }>
  | Readonly<{ from: "directory" }>;

/**
 * A content subject with its naming rule, and whether it does not exist
 * yet (「まだない対象」: the reserved place of a registration, or of a
 * companion claim's registration, while that registration is not
 * approved).
 */
export type NamedSubject = Readonly<{
  subject: ContentSubject;
  name: SubjectName;
  notYet: boolean;
}>;

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
