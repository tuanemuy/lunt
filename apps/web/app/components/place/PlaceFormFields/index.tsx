"use client";

import type { ReactNode } from "react";
import { PhotoField } from "@/components/photo/PhotoField";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type {
  PlaceField,
  PlaceFieldErrors,
  PlaceFormValues,
} from "@/presentation/placeForm";
import type { AreaLists } from "@/presentation/placeView";
import { AddressField } from "../AddressField";
import { PositionField } from "../PositionField";

type PlaceFormFieldsProps = {
  values: PlaceFormValues;
  onChange: (change: Partial<PlaceFormValues>) => void;
  errors: PlaceFieldErrors;
  lists: AreaLists;
  disabled?: boolean;
  /**
   * A line after a field, e.g. a revision application's 「変更」 with the
   * current value (RQ-02). The address takes `town`'s note.
   */
  notes?: Readonly<Partial<Record<PlaceField, ReactNode>>>;
};

/** Where CS-10's list of fields to fix leads (in-page anchors). */
export const PLACE_FIELD_ANCHOR = {
  photos: "photos",
  name: "place-name",
  town: "address",
  addressRest: "address",
  location: "location",
  businessHours: "place-hours",
  description: "place-description",
  contact: "place-contact",
} as const;

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * The store's profile as SM-02 edits it and the proxy registration enters
 * it: photos (CF-01), name, address (CF-07), position (CF-09), hours,
 * introduction and contact. The publish condition of a store is name,
 * address and position (CF-08); the rest is optional.
 */
export function PlaceFormFields({
  values,
  onChange,
  errors,
  lists,
  disabled = false,
  notes = {},
}: PlaceFormFieldsProps) {
  return (
    <>
      {values.photos[0] === undefined ? (
        <div className="m-photo-empty">写真はまだありません</div>
      ) : (
        <div className="m-photo">
          <img
            src={values.photos[0].url}
            alt={`${values.name === "" ? "店舗" : values.name}の代表写真`}
          />
        </div>
      )}
      <PhotoField
        id="photos"
        items={values.photos.map((photo) => ({ ...photo, framing: null }))}
        onChange={(items) =>
          onChange({
            photos: items.map(({ photoId, url }) => ({
              photoId,
              url: url ?? "",
            })),
          })
        }
        requirement="optional"
        addLabel="店舗写真を追加"
        help="1枚目が代表写真になります。自分で撮影した写真か、許諾を得た写真だけを登録できます。登録のたびに、Lunt での利用への同意を確かめます。"
        disabled={disabled}
        {...optionalError(errors.photos)}
      />
      {notes.photos}
      <Field
        id="place-name"
        label="店舗名"
        requirement="required"
        {...optionalError(errors.name)}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="organization"
            placeholder="例: 喫茶 日々"
            value={values.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        )}
      </Field>
      {notes.name}
      <AddressField
        town={values.town}
        rest={values.addressRest}
        onTownChange={(town) => onChange({ town })}
        onRestChange={(addressRest) => onChange({ addressRest })}
        lists={lists}
        disabled={disabled}
        {...(errors.town === undefined ? {} : { townError: errors.town })}
        {...(errors.addressRest === undefined
          ? {}
          : { restError: errors.addressRest })}
      />
      {notes.town}
      <PositionField
        idPrefix="place"
        legend="位置"
        requirement={"required"}
        subject="店舗"
        mark="店"
        latitude={values.latitude}
        longitude={values.longitude}
        onChange={onChange}
        error={errors.location}
        disabled={disabled}
      />
      {notes.location}
      <Field
        id="place-hours"
        label="営業時間"
        requirement="optional"
        {...optionalError(errors.businessHours)}
      >
        {(control) => (
          <Input
            {...control}
            name="businessHours"
            placeholder="例: 11:00〜18:00 / 火曜定休"
            value={values.businessHours}
            disabled={disabled}
            onChange={(event) =>
              onChange({ businessHours: event.currentTarget.value })
            }
          />
        )}
      </Field>
      {notes.businessHours}
      <Field
        id="place-description"
        label="お店の紹介"
        requirement="optional"
        {...optionalError(errors.description)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            placeholder="お店の雰囲気や、おすすめを書きます"
            value={values.description}
            disabled={disabled}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
          />
        )}
      </Field>
      {notes.description}
      <Field
        id="place-contact"
        label="連絡先"
        requirement="optional"
        help="電話番号・メールアドレス・ウェブサイトなど、閲覧者が店舗に連絡できる先を書きます。"
        {...optionalError(errors.contact)}
      >
        {(control) => (
          <Input
            {...control}
            name="contact"
            placeholder="例: 012-345-6789"
            value={values.contact}
            disabled={disabled}
            onChange={(event) =>
              onChange({ contact: event.currentTarget.value })
            }
          />
        )}
      </Field>
      {notes.contact}
    </>
  );
}
