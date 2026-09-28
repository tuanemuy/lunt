"use client";

import type { ReactNode } from "react";
import { addressText, type PlaceRevisionField } from "@/presentation/applyForm";
import type { PlaceStateValues } from "@/presentation/applyView";
import type { PlaceFormValues } from "@/presentation/placeForm";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { Compared, ReviewPhotos } from "../ApplyParts";

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
    value: placeValueText(state, field),
  }));
}

/**
 * 提出の前の確認 of a revision: only the items it changes, each beside
 * the place's current value (「申請の状態」).
 */
export function revisionReviewItems(
  current: PlaceStateValues,
  next: PlaceStateValues,
  changed: readonly PlaceRevisionField[],
): readonly Readonly<{ term: string; value: ReactNode }>[] {
  return changed.map((field) => ({
    term: REVIEW_TERM[field],
    value: (
      <Compared
        current={placeValueText(current, field)}
        proposed={placeValueText(next, field)}
      />
    ),
  }));
}

/** The current value a revision's 「変更」 note shows beside a field. */
export function currentPlaceText(
  current: PlaceStateValues,
  field: PlaceRevisionField,
): ReactNode {
  const { values } = current;
  return field === "photos"
    ? `${values.photos.length}枚`
    : placeValueText(current, field);
}
