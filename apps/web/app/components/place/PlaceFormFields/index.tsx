"use client";

import { PhotoField } from "@/components/photo/PhotoField";
import { Field, Fieldset, Input, Textarea } from "@/components/ui/Field";
import type {
  PlaceFieldErrors,
  PlaceFormValues,
} from "@/presentation/placeForm";
import type { AreaLists } from "@/presentation/placeView";
import { AddressField } from "../AddressField";

type PlaceFormFieldsProps = {
  values: PlaceFormValues;
  onChange: (change: Partial<PlaceFormValues>) => void;
  errors: PlaceFieldErrors;
  lists: AreaLists;
  disabled?: boolean;
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
      <Fieldset
        id="location"
        legend="位置"
        requirement="required"
        help="店舗の位置を、緯度と経度で指定します（例: 35.6812 / 139.7671）。位置は所在地から決まりません。地図で選ぶ操作は、地図の段階で加わります。"
        {...optionalError(errors.location)}
      >
        <div className="sm02-location">
          <Field id="place-latitude" label="緯度">
            {(control) => (
              <Input
                {...control}
                name="latitude"
                inputMode="decimal"
                placeholder="例: 35.6812"
                value={values.latitude}
                disabled={disabled}
                aria-invalid={errors.location === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ latitude: event.currentTarget.value })
                }
              />
            )}
          </Field>
          <Field id="place-longitude" label="経度">
            {(control) => (
              <Input
                {...control}
                name="longitude"
                inputMode="decimal"
                placeholder="例: 139.7671"
                value={values.longitude}
                disabled={disabled}
                aria-invalid={errors.location === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ longitude: event.currentTarget.value })
                }
              />
            )}
          </Field>
        </div>
      </Fieldset>
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
    </>
  );
}
