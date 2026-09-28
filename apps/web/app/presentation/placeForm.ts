import type { ErrorState } from "./errorState";
import type { PlaceProfileInput } from "./place";
import type { PhotoItem, TownOption } from "./placeView";

/** The fields of the store form (SM-02), in screen order. */
export const PLACE_FIELDS = [
  "photos",
  "name",
  "town",
  "addressRest",
  "location",
  "businessHours",
  "description",
  "contact",
] as const;
export type PlaceField = (typeof PLACE_FIELDS)[number];

export const PLACE_FIELD_LABEL = {
  photos: "写真",
  name: "店舗名",
  town: "所在地（町域）",
  addressRest: "町域より後",
  location: "位置",
  businessHours: "営業時間",
  description: "お店の紹介",
  contact: "連絡先",
} as const satisfies Readonly<Record<PlaceField, string>>;

export type PlaceFieldErrors = Readonly<Partial<Record<PlaceField, string>>>;

/** What the store form holds while it is edited. */
export type PlaceFormValues = Readonly<{
  photos: readonly PhotoItem[];
  name: string;
  town: TownOption | null;
  addressRest: string;
  latitude: string;
  longitude: string;
  businessHours: string;
  description: string;
  contact: string;
}>;

const blankToNull = (text: string): string | null =>
  text.trim() === "" ? null : text;

const coordinate = (text: string): number | null => {
  if (text.trim() === "") return null;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : null;
};

/**
 * The profile the transport takes, or the fields that cannot be sent as
 * they are: the publish condition's name, town and position (CS-10 lists
 * every one missing at once). Everything else is the server's to judge.
 */
export function toPlaceProfile(
  values: PlaceFormValues,
):
  | Readonly<{ ok: true; profile: PlaceProfileInput }>
  | Readonly<{ ok: false; errors: PlaceFieldErrors }> {
  const latitude = coordinate(values.latitude);
  const longitude = coordinate(values.longitude);
  const errors: Partial<Record<PlaceField, string>> = {};
  if (values.name.trim() === "") {
    errors.name = "店舗名を入力してください";
  }
  if (values.town === null) {
    errors.town =
      "町域を選んでください。郵便番号から探すか、都道府県・市区町村・町域を順に選びます";
  }
  if (latitude === null || longitude === null) {
    errors.location = "位置を、緯度と経度の数で入力してください";
  }
  if (
    errors.name !== undefined ||
    values.town === null ||
    latitude === null ||
    longitude === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    profile: {
      name: values.name,
      photoIds: values.photos.map((photo) => photo.photoId),
      description: blankToNull(values.description),
      town: {
        areaCode: values.town.areaCode,
        municipalityCode: values.town.municipalityCode,
        name: values.town.name,
      },
      addressRest: values.addressRest,
      location: { latitude, longitude },
      businessHours: blankToNull(values.businessHours),
      contact: blankToNull(values.contact),
    },
  };
}

const FIELD_OF_CODE: Readonly<Record<string, PlaceField>> = {
  PLACE_INVALID_NAME: "name",
  PLACE_DUPLICATE_PHOTO: "photos",
  AREA_TOWN_NOT_FOUND: "town",
  AREA_INVALID_MUNICIPALITY_CODE: "town",
  COMMON_INVALID_AREA_CODE: "town",
  COMMON_INVALID_GEO_POINT: "location",
  COMMON_INVALID_PHOTO_ID: "photos",
  MEDIA_PHOTO_NOT_AVAILABLE: "photos",
  MEDIA_PHOTO_NOT_REGISTRANT: "photos",
  MEDIA_PHOTO_ALREADY_OWNED: "photos",
};

/** `profile.location.latitude` → `location`, `profile.photoIds.0` → `photos`, … */
function fieldOfPath(path: string): PlaceField | null {
  const [head] = path.replace(/^profile\./, "").split(".");
  if (head === "photoIds") return "photos";
  if (head === "latitude" || head === "longitude") return "location";
  return (PLACE_FIELDS as readonly string[]).includes(head ?? "")
    ? (head as PlaceField)
    : null;
}

/**
 * Which fields a failed save points at (CS-10): the transport's messages
 * per path, or the business code's field with the catalog's sentence.
 */
export function placeFieldErrors(error: ErrorState): PlaceFieldErrors {
  const errors: Partial<Record<PlaceField, string>> = {};
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
