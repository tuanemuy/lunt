import type { ClaimValues, PlaceStateValues } from "./applyView";
import type { ErrorState } from "./errorState";
import {
  LISTING_FIELDS,
  type ListingField,
  type ListingFieldErrors,
  type ListingFormValues,
  type OfferingDraft,
} from "./listingForm";
import { jpDate } from "./listingView";
import { PLACE_FIELDS, type PlaceField } from "./placeForm";
import type { TownOption } from "./placeView";

/*
 * The pure pieces of the application forms (RQ-02〜RQ-04): what is
 * missing before the review, which items a revision changes, and where a
 * failed submission points.
 */

/** The claim's fields, in screen order. */
export const CLAIM_FIELDS = ["relationship", "evidence"] as const;
export type ClaimField = (typeof CLAIM_FIELDS)[number];

export const CLAIM_FIELD_LABEL = {
  relationship: "店舗との関係",
  evidence: "確認に使える連絡先・資料",
} as const satisfies Readonly<Record<ClaimField, string>>;

export const CLAIM_FIELD_ANCHOR = {
  relationship: "claim-relationship",
  evidence: "claim-evidence",
} as const satisfies Readonly<Record<ClaimField, string>>;

export type ClaimFieldErrors = Readonly<Partial<Record<ClaimField, string>>>;

/** Both texts are needed (`StewardshipClaim.create` trims them). */
export function claimErrors(claim: ClaimValues): ClaimFieldErrors {
  const errors: Partial<Record<ClaimField, string>> = {};
  if (claim.relationship.trim() === "") {
    errors.relationship = "店舗との関係を書いてください";
  }
  if (claim.evidence.trim() === "") {
    errors.evidence = "確認に使える連絡先か資料を書いてください";
  }
  return errors;
}

/**
 * The claim fields a failed submission points at: the transport's
 * messages (`relationship`, `stewardship.evidence`, …), or both blank
 * fields for `APPLICATION_INVALID_STEWARDSHIP_CLAIM`.
 */
export function claimFieldErrors(
  error: ErrorState,
  claim: ClaimValues,
): ClaimFieldErrors {
  const errors: Partial<Record<ClaimField, string>> = {};
  if (error.kind === "invalidInput") {
    for (const [path, [message]] of Object.entries(error.fieldErrors)) {
      const field = path.split(".").at(-1);
      if (
        message !== undefined &&
        (field === "relationship" || field === "evidence")
      ) {
        errors[field] ??= message;
      }
    }
  }
  if (error.code === "APPLICATION_INVALID_STEWARDSHIP_CLAIM") {
    return { ...claimErrors(claim), ...errors };
  }
  return errors;
}

/** The reply's message from a failed resubmission, if it points there. */
export function replyError(error: ErrorState): string | undefined {
  if (error.code === "APPLICATION_INVALID_RETURN_REPLY") return error.message;
  if (error.kind !== "invalidInput") return undefined;
  return error.fieldErrors.reply?.[0];
}

/** The reply as sent: blank is none. */
export const replyOf = (reply: string): string | null =>
  reply.trim() === "" ? null : reply;

/** `〒100-0005 東京都千代田区丸の内1-1`. */
export function addressText(town: TownOption | null, rest: string): string {
  if (town === null) return rest;
  const postal = `${town.areaCode.slice(0, 3)}-${town.areaCode.slice(3)}`;
  return `〒${postal} ${town.prefectureName}${town.municipalityName}${town.name}${rest}`;
}

const samePhotos = (
  a: readonly Readonly<{ photoId: string }>[],
  b: readonly Readonly<{ photoId: string }>[],
): boolean =>
  a.length === b.length &&
  a.every((photo, i) => photo.photoId === b[i]?.photoId);

const sameText = (a: string, b: string): boolean => a.trim() === b.trim();

const sameNumber = (a: string, b: string): boolean =>
  a.trim() === b.trim() || Number(a) === Number(b);

/** A place revision's items: the profile's and the operating status. */
export type PlaceRevisionField = PlaceField | "operatingStatus";

/**
 * The items `next` changes from `current`, as `FieldPatch.between` would
 * judge them from the form (the town counts for the address, whose rest
 * goes with it).
 */
export function placeChangedFields(
  current: PlaceStateValues,
  next: PlaceStateValues,
): readonly PlaceRevisionField[] {
  const a = current.values;
  const b = next.values;
  const changed = new Set<PlaceRevisionField>();
  if (!samePhotos(a.photos, b.photos)) changed.add("photos");
  if (!sameText(a.name, b.name)) changed.add("name");
  if (
    a.town?.areaCode !== b.town?.areaCode ||
    a.town?.name !== b.town?.name ||
    a.town?.municipalityCode !== b.town?.municipalityCode ||
    !sameText(a.addressRest, b.addressRest)
  ) {
    changed.add("town");
  }
  if (
    !sameNumber(a.latitude, b.latitude) ||
    !sameNumber(a.longitude, b.longitude)
  ) {
    changed.add("location");
  }
  if (!sameText(a.businessHours, b.businessHours)) {
    changed.add("businessHours");
  }
  if (!sameText(a.description, b.description)) changed.add("description");
  if (!sameText(a.contact, b.contact)) changed.add("contact");
  if (current.operatingStatus !== next.operatingStatus) {
    changed.add("operatingStatus");
  }
  return [...PLACE_FIELDS, "operatingStatus" as const].filter((field) =>
    changed.has(field),
  );
}

const sameOffering = (
  a: ListingFormValues["offering"],
  b: ListingFormValues["offering"],
): boolean => JSON.stringify(a) === JSON.stringify(b);

const sameListingPhotos = (
  a: ListingFormValues["photos"],
  b: ListingFormValues["photos"],
): boolean =>
  a.length === b.length &&
  a.every(
    (photo, i) =>
      photo.photoId === b[i]?.photoId &&
      JSON.stringify(photo.framing) === JSON.stringify(b[i]?.framing),
  );

/** The items a listing revision changes from `current`. */
export function listingChangedFields(
  current: ListingFormValues,
  next: ListingFormValues,
): readonly ListingField[] {
  const changed = new Set<ListingField>();
  if (!sameListingPhotos(current.photos, next.photos)) changed.add("photos");
  if (!sameText(current.name, next.name)) changed.add("name");
  if (current.categoryId !== next.categoryId) changed.add("category");
  if (!sameText(current.description, next.description)) {
    changed.add("description");
  }
  if (!sameOffering(current.offering, next.offering)) changed.add("offering");
  return LISTING_FIELDS.filter((field) => changed.has(field));
}

/**
 * The publish condition's items an application's listing lacks (CF-08:
 * a photo, a name, a category); the rest is the server's to judge.
 */
export function listingMissing(values: ListingFormValues): ListingFieldErrors {
  const errors: Partial<Record<ListingField, string>> = {};
  if (values.photos.length === 0) {
    errors.photos = "写真を1枚以上登録してください";
  }
  if (values.name.trim() === "") errors.name = "名称を入力してください";
  if (values.categoryId === "") {
    errors.category = "カテゴリーを1つ選んでください";
  }
  return errors;
}

/** The code an unchanged revision is refused with (CS-10). */
export const NO_CHANGE_CODE = "COMMON_INVALID_FIELD_PATCH";

/** An application id that was already an application (idempotent create). */
export const APPLICATION_ID_CONFLICT = "APPLICATION_ID_CONFLICT";

/** The resubmission read a version someone has changed since (CS-07). */
export const APPLICATION_VERSION_CONFLICT = "APPLICATION_VERSION_CONFLICT";

/**
 * The codes a submission is refused with for a reason of 「受け付けない事情」:
 * the screen reads the eligibility afresh and shows the refusal.
 */
export const REFUSAL_CODES: ReadonlySet<string> = new Set([
  "APPLICATION_PLACE_HAS_STEWARD",
  "APPLICATION_TARGET_NOT_VIEWABLE",
  "APPLICATION_ALREADY_ACTIVE",
  "APPLICATION_LISTING_NOT_FOUND",
  "APPLICATION_ALREADY_STEWARD",
  "APPLICATION_REGISTRATION_NOT_STANDING",
]);

/** A local CS-10 for fields the form found wrong before sending. */
export const INPUT_ERROR: ErrorState = {
  kind: "invalidInput",
  code: null,
  message: "入力内容を確かめてください",
  fieldErrors: {},
  missing: [],
};

/** CF-06 as the review and the 「現在の値」 note word it. */
export function offeringDraftText(offering: OfferingDraft): string {
  switch (offering.kind) {
    case "none":
      return "設定しない";
    case "period": {
      const start = offering.start === "" ? "" : jpDate(offering.start);
      const end = offering.end === "" ? "" : jpDate(offering.end);
      return `提供期間 · ${start}〜${end}`;
    }
    case "dates":
      return offering.dates.length === 0
        ? "開催日 · なし"
        : `開催日 · ${offering.dates.map(jpDate).join("、")}`;
  }
}

/** The form has nothing to submit that differs from the target now (CS-10). */
export const NO_CHANGE_ERROR: ErrorState = {
  kind: "invalidInput",
  code: NO_CHANGE_CODE,
  message:
    "現在の内容から変わった項目がありません。直す項目を変えてから、もう一度確かめてください",
  fieldErrors: {},
  missing: [],
};
