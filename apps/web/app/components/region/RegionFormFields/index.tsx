"use client";

import { PhotoField } from "@/components/photo/PhotoField";
import { AddressField } from "@/components/place/AddressField";
import { PositionField } from "@/components/place/PositionField";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { AreaLists } from "@/presentation/placeView";
import type {
  RegionFieldErrors,
  RegionFormValues,
} from "@/presentation/regionForm";

type RegionFormFieldsProps = {
  values: RegionFormValues;
  onChange: (change: Partial<RegionFormValues>) => void;
  errors: RegionFieldErrors;
  lists: AreaLists;
  disabled?: boolean;
  /** The photo band's text when there is no photo (CS-16: 写真は削除されました). */
  emptyPhotoText?: string;
};

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * The region's content as RM-02 edits and registers it: photos (CF-01),
 * name, catch-copy, introduction, address (CF-07) and position (CF-09).
 * The publish requirements are name, address, position and a photo
 * (CF-08); a draft may leave any of them empty.
 */
export function RegionFormFields({
  values,
  onChange,
  errors,
  lists,
  disabled = false,
  emptyPhotoText = "写真はまだありません",
}: RegionFormFieldsProps) {
  const [cover] = values.photos;
  return (
    <>
      {cover === undefined ? (
        <div
          className="m-photo-empty"
          aria-invalid={errors.photos === undefined ? undefined : true}
        >
          {emptyPhotoText}
        </div>
      ) : (
        <div className="m-photo">
          <img
            src={cover.url}
            alt={`${values.name === "" ? "地域" : values.name}の代表写真`}
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
        requirement="publish"
        addLabel="写真を追加"
        help="1枚目が代表写真になります。自分で撮影した写真か、許諾を得た写真だけを登録できます。登録のたびに、Lunt での利用への同意を確かめます。"
        disabled={disabled}
        {...optionalError(errors.photos)}
      />
      <Field
        id="region-name"
        label="名称"
        requirement="publish"
        {...optionalError(errors.name)}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder="例: こもれび商店街"
            value={values.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        )}
      </Field>
      <Field
        id="region-tagline"
        label="キャッチコピー"
        requirement="optional"
        help="フィードと地域ページで、写真に添えて明朝で示します。"
        {...optionalError(errors.tagline)}
      >
        {(control) => (
          <Input
            {...control}
            name="tagline"
            placeholder="例: 喫茶と器と、小さな寄り道。"
            value={values.tagline}
            disabled={disabled}
            onChange={(event) =>
              onChange({ tagline: event.currentTarget.value })
            }
          />
        )}
      </Field>
      <Field
        id="region-description"
        label="紹介"
        requirement="optional"
        {...optionalError(errors.description)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            placeholder="地域の雰囲気や、歩き方を書きます"
            value={values.description}
            disabled={disabled}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
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
        requirement="publish"
        {...(errors.town === undefined ? {} : { townError: errors.town })}
        {...(errors.addressRest === undefined
          ? {}
          : { restError: errors.addressRest })}
      />
      <PositionField
        idPrefix="region"
        legend="位置"
        requirement={"publish"}
        subject="地域"
        mark="地"
        latitude={values.latitude}
        longitude={values.longitude}
        onChange={onChange}
        error={errors.location}
        disabled={disabled}
      />
    </>
  );
}
