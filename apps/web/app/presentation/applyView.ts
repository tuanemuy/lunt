import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { ListingFormValues } from "./listingForm";
import type { CategoryOption } from "./listingView";
import type { PlaceFormValues } from "./placeForm";
import type { AreaLists, OperatingStatus, PhotoItem } from "./placeView";

/*
 * What the application screens (RQ-02〜RQ-04) show, as plain serializable
 * data. Client-safe: types only from the core.
 */

/** The place an application is about, as the screens name it. */
export type ApplyPlace = Readonly<{
  placeId: string;
  name: string;
  address: string;
  cover: PhotoItem | null;
  operatingStatus: OperatingStatus;
}>;

/**
 * How the screen was opened: a new application, a reapplication from an
 * ended one (its content prepared by `prepareReapplication`), or the
 * resubmission of a returned one.
 */
export type ApplyMode =
  | Readonly<{ kind: "new" }>
  | Readonly<{
      kind: "reapply";
      /** The ended application the content came from. */
      from: string;
      ended: Extract<
        ApplicationStatusKind,
        "rejected" | "withdrawn" | "lapsed"
      >;
      /** When the ended application was submitted (ISO). */
      submittedAt: string;
    }>
  | Readonly<{
      kind: "resubmit";
      applicationId: string;
      /** The version the resubmission is sent against (CS-07). */
      version: number;
      /** The approver's request (追加で必要な確認). */
      request: string;
      /** Who asked, as MY-05 names the approver: 運営, or the region's / event's stewards. */
      requestedBy: string;
    }>;

/**
 * Why an application cannot be started or submitted (「受け付けない事情」),
 * each with the destinations `spec/pages/index.md` names.
 */
export type ApplyRefusal =
  /** A steward runs the place: RQ-08 for errors or closure, RQ-03 for its people. */
  | Readonly<{
      kind: "hasSteward";
      placeId: string;
      /** The listing a listing revision was for, when it is the subject. */
      listingId: string | null;
    }>
  /** The applicant already stewards the place: SM-01. */
  | Readonly<{ kind: "alreadySteward"; placeId: string }>
  /** The registration a claim was filed with ended: reapply for it (RQ-02). */
  | Readonly<{ kind: "registrationEnded"; registrationId: string }>
  /** The target cannot be viewed, or the listing is gone (CS-06). */
  | Readonly<{ kind: "unavailable"; subject: "place" | "listing" }>
  /** The same applicant's application is under review or returned: its MY-05. */
  | Readonly<{
      kind: "active";
      applicationId: string;
      subject: "place" | "listing";
    }>
  /** A resubmission of an application that is no longer returned (CS-08). */
  | Readonly<{
      kind: "notReturned";
      applicationId: string;
      status: ApplicationStatusKind;
    }>
  /** A reapplication from an application that has not ended (CS-08). */
  | Readonly<{
      kind: "notEnded";
      applicationId: string;
      status: ApplicationStatusKind;
    }>;

/** The claim's two texts (RQ-03, and the claim filed with a registration). */
export type ClaimValues = Readonly<{ relationship: string; evidence: string }>;

export const EMPTY_CLAIM: ClaimValues = { relationship: "", evidence: "" };

/** A place's desired state in a revision application: the profile and the operating status. */
export type PlaceStateValues = Readonly<{
  values: PlaceFormValues;
  operatingStatus: OperatingStatus;
}>;

/** RQ-02 登録. */
export type RegistrationFormData = Readonly<{
  mode: ApplyMode;
  lists: AreaLists;
  start: PlaceFormValues;
}>;

/** RQ-02 修正. */
export type PlaceRevisionFormData = Readonly<{
  mode: ApplyMode;
  place: ApplyPlace;
  lists: AreaLists;
  /** The place as it is now: what the changes are compared with. */
  current: PlaceStateValues;
  start: PlaceStateValues;
}>;

/** RQ-03. */
export type StewardshipFormData = Readonly<{
  mode: ApplyMode;
  /** The place, or the name of a registration's place that does not exist yet. */
  place:
    | Readonly<{ kind: "place"; place: ApplyPlace; hasSteward: boolean }>
    | Readonly<{ kind: "notYet"; placeId: string; name: string }>;
  /** What the claim refers to: the place, or the registration it was filed with. */
  target: Readonly<{ placeId: string }> | Readonly<{ registrationId: string }>;
  start: ClaimValues;
}>;

/** RQ-04 新しい掲載. */
export type NewListingFormData = Readonly<{
  mode: ApplyMode;
  place: ApplyPlace;
  categories: readonly CategoryOption[];
  start: ListingFormValues;
}>;

/** The listing a revision application is about. */
export type ApplyListing = Readonly<{
  listingId: string;
  name: string;
  cover: PhotoItem | null;
}>;

/** RQ-04 修正. */
export type ListingRevisionFormData = Readonly<{
  mode: ApplyMode;
  listing: ApplyListing;
  place: ApplyPlace;
  categories: readonly CategoryOption[];
  /** The listing as it is now (its category resolved to an active one). */
  current: ListingFormValues;
  /** The name of `current`'s category, for 「現在の値」. */
  currentCategoryName: string | null;
  start: ListingFormValues;
}>;

/** A screen's first load: the form, or the reason it cannot start. */
export type ApplyPage<D> =
  | Readonly<{ kind: "form"; data: D }>
  | Readonly<{ kind: "refused"; refusal: ApplyRefusal }>;

/** `/me/applications/$applicationId` (MY-05), a plain path (another area). */
export const applicationPath = (applicationId: string): string =>
  `/me/applications/${encodeURIComponent(applicationId)}`;

/** Which application's 「受け付けない」 sent the user to RQ-08 (its `from`). */
export type InfoReportFrom = "placeRevision" | "newListing" | "listingRevision";

/** RQ-08 for a place or a listing (another area), from an application's refusal when `from` is given. */
export const infoReportPath = (
  kind: "place" | "listing",
  id: string,
  from?: InfoReportFrom,
): string =>
  `/info-report/${kind}/${encodeURIComponent(id)}${from === undefined ? "" : `?from=${from}`}`;

/** RQ-07 for a place or a listing (another area). */
export const takedownPath = (kind: "place" | "listing", id: string): string =>
  `/takedown/${kind}/${encodeURIComponent(id)}`;

/** SM-01 of a place (another area). */
export const shopHomePath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}`;
