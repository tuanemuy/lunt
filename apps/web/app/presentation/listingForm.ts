import type { ErrorState } from "./errorState";
import type { ListingContentValues } from "./listing";
import type { Framing, ListingEditorData, Offering } from "./listingView";

/** The fields of the listing form (SM-04), in screen order. */
export const LISTING_FIELDS = [
  "photos",
  "name",
  "category",
  "description",
  "offering",
] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export const LISTING_FIELD_LABEL = {
  photos: "写真",
  name: "名称",
  category: "カテゴリー",
  description: "紹介文",
  offering: "提供の設定",
} as const satisfies Readonly<Record<ListingField, string>>;

/** In-page anchors of the fields, for CS-10's list. */
export const LISTING_FIELD_ANCHOR = {
  photos: "photos",
  name: "listing-name",
  category: "listing-category",
  description: "listing-description",
  offering: "offering",
} as const satisfies Readonly<Record<ListingField, string>>;

export type ListingFieldErrors = Readonly<
  Partial<Record<ListingField, string>>
>;

/** CF-06 as the form holds it: one of the three, days as `YYYY-MM-DD` (empty = not set). */
export type OfferingDraft =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; start: string; end: string }>
  | Readonly<{ kind: "dates"; dates: readonly string[] }>;

export type ListingFormPhoto = Readonly<{
  photoId: string;
  url: string | null;
  framing: Framing | null;
}>;

export type ListingFormValues = Readonly<{
  photos: readonly ListingFormPhoto[];
  name: string;
  categoryId: string;
  description: string;
  offering: OfferingDraft;
}>;

export const EMPTY_LISTING_FORM: ListingFormValues = {
  photos: [],
  name: "",
  categoryId: "",
  description: "",
  offering: { kind: "none" },
};

export function offeringDraftOf(offering: Offering): OfferingDraft {
  switch (offering.kind) {
    case "none":
      return { kind: "none" };
    case "period":
      return {
        kind: "period",
        start: offering.period.start ?? "",
        end: offering.period.end ?? "",
      };
    case "dates":
      return { kind: "dates", dates: [...offering.dates] };
  }
}

export const listingFormValuesOf = (
  data: ListingEditorData,
): ListingFormValues => ({
  photos: data.photos,
  name: data.name,
  categoryId: data.categoryId ?? "",
  description: data.description,
  offering: offeringDraftOf(data.offering),
});

const blankToNull = (text: string): string | null =>
  text.trim() === "" ? null : text;

/** The content the transport takes; blanks are "not entered". */
export function toListingContent(
  values: ListingFormValues,
): ListingContentValues {
  const { offering } = values;
  return {
    name: blankToNull(values.name),
    description: blankToNull(values.description),
    categoryId: blankToNull(values.categoryId),
    photos: values.photos.map(({ photoId, framing }) => ({ photoId, framing })),
    offering:
      offering.kind === "period"
        ? {
            kind: "period",
            start: blankToNull(offering.start),
            end: blankToNull(offering.end),
          }
        : offering.kind === "dates"
          ? { kind: "dates", dates: [...offering.dates] }
          : { kind: "none" },
  };
}

const MISSING_MESSAGE: Readonly<
  Record<string, readonly [ListingField, string]>
> = {
  photos: ["photos", "写真を1枚以上登録してください"],
  name: ["name", "名称を入力してください"],
  category: ["category", "カテゴリーを選んでください"],
};

const FIELD_OF_CODE: Readonly<Record<string, ListingField>> = {
  LISTING_INVALID_NAME: "name",
  LISTING_INVALID_DESCRIPTION: "description",
  LISTING_CATEGORY_NOT_AVAILABLE: "category",
  COMMON_INVALID_CATEGORY_ID: "category",
  LISTING_INVALID_FRAMING: "photos",
  LISTING_DUPLICATE_PHOTO: "photos",
  COMMON_INVALID_PHOTO_ID: "photos",
  MEDIA_PHOTO_NOT_AVAILABLE: "photos",
  MEDIA_PHOTO_NOT_REGISTRANT: "photos",
  MEDIA_PHOTO_ALREADY_OWNED: "photos",
  LISTING_INVALID_OFFERING_PERIOD: "offering",
  LISTING_INVALID_OPEN_DATES: "offering",
  COMMON_INVALID_LOCAL_DATE: "offering",
};

function fieldOfPath(path: string): ListingField | null {
  const [head] = path.replace(/^content\./, "").split(".");
  switch (head) {
    case "photos":
    case "name":
    case "description":
    case "offering":
      return head;
    case "categoryId":
      return "category";
    default:
      return null;
  }
}

/**
 * The premise changes (CS-08) that leave the editor's input in place: the
 * user re-picks one field instead of starting over from the stored
 * listing (`spec/pages/shop.md` SM-04: 「廃止の場合は、現役のカテゴリーから
 * 選び直す」).
 */
export const REPICK_CODES: Readonly<Record<string, ListingField>> = {
  LISTING_CATEGORY_NOT_AVAILABLE: "category",
};

/**
 * Which fields a failed save or publish points at: for CS-10 the unmet
 * publish conditions (`missing`), the transport's messages per path, or a
 * business code's field with the catalog's sentence; for a CS-08 that
 * asks to re-pick a field (`REPICK_CODES`), that field.
 */
export function listingFieldErrors(error: ErrorState): ListingFieldErrors {
  const errors: Partial<Record<ListingField, string>> = {};
  if (error.kind === "premiseChanged") {
    const field = error.code === null ? undefined : REPICK_CODES[error.code];
    if (field !== undefined) errors[field] = error.message;
    return errors;
  }
  if (error.kind !== "invalidInput") return errors;
  for (const item of error.missing) {
    const entry = MISSING_MESSAGE[item];
    if (entry !== undefined) errors[entry[0]] = entry[1];
  }
  for (const [path, messages] of Object.entries(error.fieldErrors)) {
    const field = fieldOfPath(path);
    const [message] = messages;
    if (
      field !== null &&
      message !== undefined &&
      errors[field] === undefined
    ) {
      errors[field] = message;
    }
  }
  const field = error.code === null ? undefined : FIELD_OF_CODE[error.code];
  if (field !== undefined && errors[field] === undefined) {
    errors[field] = error.message;
  }
  return errors;
}
