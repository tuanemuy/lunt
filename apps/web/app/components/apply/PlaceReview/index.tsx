"use client";

import type { ReactNode } from "react";
import { addressText, type PlaceRevisionField } from "@/presentation/applyForm";
import type { PlaceStateValues } from "@/presentation/applyView";
import type { PlaceFormValues } from "@/presentation/placeForm";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { ChangedNote, Compared, ReviewPhotos } from "../ApplyParts";

const orNone = (text: string): string => (text.trim() === "" ? "なし" : text);

const REVIEW_TERM = {
  photos: "写真",
  name: "店舗名",
  town: "所在地",
  addressRest: "所在地",
  location: "位置",
  businessHours: "営業時間",
  description: "お店の紹介",
  contact: "連絡先",
  operatingStatus: "営業状況",
} as const satisfies Readonly<Record<PlaceRevisionField, string>>;

function placeValueText(
  state: PlaceStateValues,
  field: PlaceRevisionField,
): ReactNode {
  const { values } = state;
  switch (field) {
    case "photos":
      return <ReviewPhotos photos={values.photos} />;
    case "name":
      return values.name;
    case "town":
    case "addressRest":
      return addressText(values.town, values.addressRest);
    case "location":
      return `緯度 ${values.latitude} / 経度 ${values.longitude}`;
    case "businessHours":
      return orNone(values.businessHours);
    case "description":
      return orNone(values.description);
    case "contact":
      return orNone(values.contact);
    case "operatingStatus":
      return OPERATING_STATUS_LABEL[state.operatingStatus];
  }
}

/**
 * The position row of 提出の前の確認 reads as the design words it
 * (`RQ-02_店舗の申請.html` 「地図で指定済み」), not as coordinates.
 */
const LOCATION_REVIEW_TEXT = "地図で指定済み";

/**
 * A revision's changed position: both sides would read 「地図で指定済み」,
 * so the row says the position changes instead of comparing two values.
 */
const LOCATION_CHANGED_REVIEW_TEXT = `${LOCATION_REVIEW_TEXT}（変更あり）`;

/** The input step's 「変更」 note under the map: the position is set anew. */
const LOCATION_CHANGED_NOTE_TEXT = `${LOCATION_REVIEW_TEXT}（現在の位置から変更）`;

const REGISTRATION_FIELDS = [
  "photos",
  "name",
  "town",
  "location",
  "businessHours",
  "description",
  "contact",
] as const satisfies readonly PlaceRevisionField[];

/** 提出の前の確認 of a registration: every item of the profile. */
export function registrationReviewItems(
  values: PlaceFormValues,
): readonly Readonly<{ term: string; value: ReactNode }>[] {
  const state: PlaceStateValues = { values, operatingStatus: "open" };
  return REGISTRATION_FIELDS.map((field) => ({
    term: REVIEW_TERM[field],
    value:
      field === "location"
        ? LOCATION_REVIEW_TEXT
        : placeValueText(state, field),
  }));
}

/**
 * 提出の前の確認 of a revision: only the items it changes, each beside
 * the place's current value (「申請の状態」); a changed position is said to
 * change rather than compared.
 */
export function revisionReviewItems(
  current: PlaceStateValues,
  next: PlaceStateValues,
  changed: readonly PlaceRevisionField[],
): readonly Readonly<{ term: string; value: ReactNode }>[] {
  return changed.map((field) => ({
    term: REVIEW_TERM[field],
    value:
      field === "location" ? (
        LOCATION_CHANGED_REVIEW_TEXT
      ) : (
        <Compared
          current={placeValueText(current, field)}
          proposed={placeValueText(next, field)}
        />
      ),
  }));
}

/**
 * A revision's 「変更」 note beside a field: the place's current value, or
 * for the position the design's wording (「地図で指定済み」) with the current
 * coordinates left to assistive technology.
 */
export function PlaceChangedNote({
  current,
  field,
}: {
  current: PlaceStateValues;
  field: PlaceRevisionField;
}) {
  switch (field) {
    case "location":
      return (
        <ChangedNote>
          {LOCATION_CHANGED_NOTE_TEXT}
          <span className="sr-only">
            （現在の値: {placeValueText(current, field)}）
          </span>
        </ChangedNote>
      );
    case "photos":
      return <ChangedNote current={`${current.values.photos.length}枚`} />;
    default:
      return <ChangedNote current={placeValueText(current, field)} />;
  }
}
