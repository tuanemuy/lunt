import type { ErrorState } from "./errorState";
import type { OccasionContentInput } from "./occasion";
import type { OccasionEditorData } from "./occasionView";
import type { PhotoItem, TownOption } from "./placeView";

/** The fields of the event form (EM-02), in screen order. */
export const OCCASION_FIELDS = [
  "photos",
  "name",
  "period",
  "tagline",
  "description",
  "town",
  "addressRest",
  "location",
] as const;
export type OccasionField = (typeof OCCASION_FIELDS)[number];

export const OCCASION_FIELD_LABEL = {
  photos: "写真",
  name: "名称",
  period: "開催期間",
  tagline: "キャッチコピー",
  description: "紹介",
  town: "開催場所の所在地（町域）",
  addressRest: "町域より後",
  location: "開催場所の位置",
} as const satisfies Readonly<Record<OccasionField, string>>;

/** Where CS-10's list of fields to fix leads (in-page anchors). */
export const OCCASION_FIELD_ANCHOR = {
  photos: "photos",
  name: "occasion-name",
  period: "occasion-period",
  tagline: "occasion-tagline",
  description: "occasion-description",
  town: "address",
  addressRest: "address",
  location: "location",
} as const satisfies Readonly<Record<OccasionField, string>>;

export type OccasionFieldErrors = Readonly<
  Partial<Record<OccasionField, string>>
>;

/** What the event form holds while it is edited. */
export type OccasionFormValues = Readonly<{
  photos: readonly PhotoItem[];
  name: string;
  start: string;
  end: string;
  tagline: string;
  description: string;
  town: TownOption | null;
  addressRest: string;
  latitude: string;
  longitude: string;
}>;

export const EMPTY_OCCASION_FORM: OccasionFormValues = {
  photos: [],
  name: "",
  start: "",
  end: "",
  tagline: "",
  description: "",
  town: null,
  addressRest: "",
  latitude: "",
  longitude: "",
};

export const occasionFormValuesOf = (
  data: OccasionEditorData,
): OccasionFormValues => ({
  photos: data.photos,
  name: data.name,
  start: data.period?.start ?? "",
  end: data.period?.end ?? "",
  tagline: data.tagline,
  description: data.description,
  town: data.town,
  addressRest: data.addressRest,
  latitude: data.location === null ? "" : String(data.location.latitude),
  longitude: data.location === null ? "" : String(data.location.longitude),
});

const blankToNull = (text: string): string | null =>
  text.trim() === "" ? null : text;

const coordinate = (text: string): number | null => {
  if (text.trim() === "") return null;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : null;
};

const monthDay = (day: string): string => {
  const [, month, date] = day.split("-").map(Number);
  return `${month}月${date}日`;
};

/**
 * The content the transport takes, or the fields that cannot be sent as
 * they are: a period with one day only or an end before its start (CS-10
 * 開催期間の誤り), a position that is not two numbers. Every field may be
 * empty until the event is published; the publish requirements are the
 * server's to judge.
 */
export function toOccasionContent(
  values: OccasionFormValues,
):
  | Readonly<{ ok: true; content: OccasionContentInput }>
  | Readonly<{ ok: false; errors: OccasionFieldErrors }> {
  const errors: Partial<Record<OccasionField, string>> = {};
  const start = values.start.trim();
  const end = values.end.trim();
  if ((start === "") !== (end === "")) {
    errors.period = "開始日と終了日の両方を選んでください";
  } else if (start !== "" && end < start) {
    errors.period = `終了日は、開始日（${monthDay(start)}）と同じ日か、それより後にしてください`;
  }
  const latitude = coordinate(values.latitude);
  const longitude = coordinate(values.longitude);
  const noPosition =
    values.latitude.trim() === "" && values.longitude.trim() === "";
  if (!noPosition && (latitude === null || longitude === null)) {
    errors.location = "位置を、緯度と経度の数で入力してください";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    content: {
      name: blankToNull(values.name),
      period: start === "" ? null : { start, end },
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
      location:
        latitude === null || longitude === null
          ? null
          : { latitude, longitude },
      photoIds: values.photos.map((photo) => photo.photoId),
      description: blankToNull(values.description),
      tagline: blankToNull(values.tagline),
    },
  };
}

/** A publish requirement (`OccasionRequirement`) → the fields that meet it. */
const REQUIREMENT_FIELDS: Readonly<Record<string, readonly OccasionField[]>> = {
  name: ["name"],
  period: ["period"],
  venue: ["town", "location"],
  photos: ["photos"],
};

const REQUIREMENT_MESSAGE: Readonly<Partial<Record<OccasionField, string>>> = {
  name: "公開には、名称が必要です",
  period: "公開には、開催期間が必要です",
  town: "公開には、開催場所の所在地が必要です",
  location: "公開には、開催場所の位置が必要です",
  photos: "公開には、写真が1枚以上必要です",
};

const FIELD_OF_CODE: Readonly<Record<string, OccasionField>> = {
  OCCASION_INVALID_NAME: "name",
  OCCASION_INVALID_DESCRIPTION: "description",
  OCCASION_DUPLICATE_PHOTO: "photos",
  COMMON_INVALID_TAGLINE: "tagline",
  COMMON_INVALID_DATE_RANGE: "period",
  COMMON_INVALID_LOCAL_DATE: "period",
  AREA_TOWN_NOT_FOUND: "town",
  AREA_INVALID_MUNICIPALITY_CODE: "town",
  COMMON_INVALID_AREA_CODE: "town",
  COMMON_INVALID_GEO_POINT: "location",
  COMMON_INVALID_PHOTO_ID: "photos",
  MEDIA_PHOTO_NOT_AVAILABLE: "photos",
  MEDIA_PHOTO_NOT_REGISTRANT: "photos",
  MEDIA_PHOTO_ALREADY_OWNED: "photos",
};

/** `content.period.start` → `period`, `content.photoIds.0` → `photos`, … */
function fieldOfPath(path: string): OccasionField | null {
  const parts = path.replace(/^content\./, "").split(".");
  const [head] = parts;
  if (head === "photoIds") return "photos";
  if (head === "location") return "location";
  if (head === "address") return parts[1] === "rest" ? "addressRest" : "town";
  return (OCCASION_FIELDS as readonly string[]).includes(head ?? "")
    ? (head as OccasionField)
    : null;
}

/**
 * Which fields a failed save or publish points at (CS-10): the unmet
 * publish requirements (`missing`), the transport's messages per path, or
 * the business code's field with the catalog's sentence.
 */
export function occasionFieldErrors(error: ErrorState): OccasionFieldErrors {
  const errors: Partial<Record<OccasionField, string>> = {};
  if (error.kind === "invalidInput") {
    for (const item of error.missing) {
      for (const field of REQUIREMENT_FIELDS[item] ?? []) {
        errors[field] ??= REQUIREMENT_MESSAGE[field] ?? error.message;
      }
    }
    for (const [path, messages] of Object.entries(error.fieldErrors)) {
      const field = fieldOfPath(path);
      const [message] = messages;
      if (field !== null && message !== undefined) errors[field] ??= message;
    }
  }
  const field = error.code === null ? undefined : FIELD_OF_CODE[error.code];
  if (field !== undefined) errors[field] ??= error.message;
  return errors;
}
