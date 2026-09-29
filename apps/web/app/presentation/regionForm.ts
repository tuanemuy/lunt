import type { ErrorState } from "./errorState";
import type { PhotoItem, TownOption } from "./placeView";
import type { RegionContentInput } from "./region";
import type { RegionEditorData, RegionRequirement } from "./regionView";

/** The fields of the region form (RM-02), in screen order. */
export const REGION_FIELDS = [
  "photos",
  "name",
  "tagline",
  "description",
  "town",
  "addressRest",
  "location",
] as const;
export type RegionField = (typeof REGION_FIELDS)[number];

export const REGION_FIELD_LABEL = {
  photos: "写真",
  name: "名称",
  tagline: "キャッチコピー",
  description: "紹介",
  town: "所在地（町域）",
  addressRest: "町域より後",
  location: "位置",
} as const satisfies Readonly<Record<RegionField, string>>;

/** Where CS-10's list of fields to fix leads (in-page anchors). */
export const REGION_FIELD_ANCHOR = {
  photos: "photos",
  name: "region-name",
  tagline: "region-tagline",
  description: "region-description",
  town: "address",
  addressRest: "address",
  location: "location",
} as const satisfies Readonly<Record<RegionField, string>>;

export type RegionFieldErrors = Readonly<Partial<Record<RegionField, string>>>;

/** What the region form holds while it is edited. */
export type RegionFormValues = Readonly<{
  photos: readonly PhotoItem[];
  name: string;
  tagline: string;
  description: string;
  town: TownOption | null;
  addressRest: string;
  latitude: string;
  longitude: string;
}>;

export const EMPTY_REGION_FORM: RegionFormValues = {
  photos: [],
  name: "",
  tagline: "",
  description: "",
  town: null,
  addressRest: "",
  latitude: "",
  longitude: "",
};

export const regionFormValuesOf = (
  data: RegionEditorData,
): RegionFormValues => ({
  photos: data.photos,
  name: data.name,
  tagline: data.tagline,
  description: data.description,
  town: data.town,
  addressRest: data.addressRest,
  latitude: data.location === null ? "" : String(data.location.latitude),
  longitude: data.location === null ? "" : String(data.location.longitude),
});

const blankToNull = (text: string): string | null =>
  text.trim() === "" ? null : text;

/**
 * The content the transport takes, or the fields that cannot be sent as
 * they are: a position with one coordinate or a non-number, a street part
 * without its town. Every field may be left empty — a draft is saved
 * without its publish requirements (CF-08).
 */
export function toRegionContent(
  values: RegionFormValues,
):
  | Readonly<{ ok: true; content: RegionContentInput }>
  | Readonly<{ ok: false; errors: RegionFieldErrors }> {
  const errors: Partial<Record<RegionField, string>> = {};
  const lat = values.latitude.trim();
  const lng = values.longitude.trim();
  const latitude = Number(lat);
  const longitude = Number(lng);
  const noLocation = lat === "" && lng === "";
  if (
    !noLocation &&
    (lat === "" ||
      lng === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude))
  ) {
    errors.location = "位置は、緯度と経度の両方を数で入力してください";
  }
  if (values.town === null && values.addressRest.trim() !== "") {
    errors.town =
      "町域を選んでください。郵便番号から探すか、都道府県・市区町村・町域を順に選びます";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    content: {
      name: blankToNull(values.name),
      tagline: blankToNull(values.tagline),
      description: blankToNull(values.description),
      photoIds: values.photos.map((photo) => photo.photoId),
      address:
        values.town === null
          ? null
          : {
              town: {
                areaCode: values.town.areaCode,
                municipalityCode: values.town.municipalityCode,
                name: values.town.name,
              },
              rest: values.addressRest,
            },
      location: noLocation ? null : { latitude, longitude },
    },
  };
}

const REQUIREMENT_FIELD = {
  name: "name",
  address: "town",
  location: "location",
  photos: "photos",
} as const satisfies Readonly<Record<RegionRequirement, RegionField>>;

const REQUIREMENT_MESSAGE = {
  name: "公開には、名称が必要です",
  address: "公開には、所在地（町域）が必要です",
  location: "公開には、位置の指定が必要です",
  photos: "公開には、写真が1枚以上必要です",
} as const satisfies Readonly<Record<RegionRequirement, string>>;

const isRequirement = (value: string): value is RegionRequirement =>
  Object.hasOwn(REQUIREMENT_FIELD, value);

/** The publish requirements an error says are missing (CS-10 of CF-08). */
export function missingRequirements(
  error: ErrorState,
): readonly RegionRequirement[] {
  return error.kind === "invalidInput"
    ? error.missing.filter(isRequirement)
    : [];
}

/** Each missing requirement as its field's message. */
export function requirementErrors(
  missing: readonly RegionRequirement[],
): RegionFieldErrors {
  const errors: Partial<Record<RegionField, string>> = {};
  for (const requirement of missing) {
    errors[REQUIREMENT_FIELD[requirement]] = REQUIREMENT_MESSAGE[requirement];
  }
  return errors;
}

const FIELD_OF_CODE: Readonly<Record<string, RegionField>> = {
  REGION_INVALID_NAME: "name",
  REGION_INVALID_DESCRIPTION: "description",
  REGION_DUPLICATE_PHOTO: "photos",
  COMMON_INVALID_TAGLINE: "tagline",
  AREA_TOWN_NOT_FOUND: "town",
  AREA_INVALID_MUNICIPALITY_CODE: "town",
  COMMON_INVALID_AREA_CODE: "town",
  COMMON_INVALID_GEO_POINT: "location",
  COMMON_INVALID_PHOTO_ID: "photos",
  MEDIA_PHOTO_NOT_AVAILABLE: "photos",
  MEDIA_PHOTO_NOT_REGISTRANT: "photos",
  MEDIA_PHOTO_ALREADY_OWNED: "photos",
};

/** `content.location.latitude` → `location`, `content.photoIds.0` → `photos`, … */
function fieldOfPath(path: string): RegionField | null {
  const parts = path.replace(/^content\./, "").split(".");
  const [head] = parts;
  if (head === "photoIds") return "photos";
  if (head === "location") return "location";
  if (head === "address") return parts[1] === "rest" ? "addressRest" : "town";
  return (REGION_FIELDS as readonly string[]).includes(head ?? "")
    ? (head as RegionField)
    : null;
}

/**
 * Which fields a failed save or publish points at (CS-10): the transport's
 * messages per path, the business code's field with the catalog's
 * sentence, and each unmet publish requirement.
 */
export function regionFieldErrors(error: ErrorState): RegionFieldErrors {
  const errors: Partial<Record<RegionField, string>> = {
    ...requirementErrors(missingRequirements(error)),
  };
  if (error.kind === "invalidInput") {
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
  }
  const field = error.code === null ? undefined : FIELD_OF_CODE[error.code];
  if (field !== undefined && errors[field] === undefined) {
    errors[field] = error.message;
  }
  return errors;
}
