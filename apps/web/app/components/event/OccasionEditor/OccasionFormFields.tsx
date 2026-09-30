"use client";

import { PhotoField } from "@/components/photo/PhotoField";
import { AddressField } from "@/components/place/AddressField";
import { PositionField } from "@/components/place/PositionField";
import { Field, Fieldset, Input, Textarea } from "@/components/ui/Field";
import type {
  OccasionFieldErrors,
  OccasionFormValues,
} from "@/presentation/occasionForm";
import type { AreaLists } from "@/presentation/placeView";

type OccasionFormFieldsProps = {
  values: OccasionFormValues;
  onChange: (change: Partial<OccasionFormValues>) => void;
  errors: OccasionFieldErrors;
  lists: AreaLists;
  disabled?: boolean;
  /** The photos were taken down by a claim (CS-16): the empty cover says so. */
  photosTakenDown?: boolean;
};

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * The event's content as EM-02 enters it: photos (CF-01), name, holding
 * period, tagline, introduction, venue address (CF-07) and position
 * (CF-09). Name, period, venue and a photo are the publish requirements
 * (CF-08); a draft may leave any of them empty.
 */
export function OccasionFormFields({
  values,
  onChange,
  errors,
  lists,
  disabled = false,
  photosTakenDown = false,
}: OccasionFormFieldsProps) {
  return (
    <>
      {values.photos[0] === undefined ? (
        <div
          className="m-photo-empty"
          {...(errors.photos === undefined ? {} : { "aria-invalid": true })}
        >
          {photosTakenDown ? "写真は削除されました" : "写真はまだありません"}
        </div>
      ) : (
        <div className="m-photo">
          <img
            src={values.photos[0].url}
            alt={`${values.name === "" ? "イベント" : values.name}の代表写真`}
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
        id="occasion-name"
        label="名称"
        requirement="publish"
        {...optionalError(errors.name)}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder="例: こもれび 器と喫茶の市"
            value={values.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        )}
      </Field>
      <Fieldset
        id="occasion-period"
        legend="開催期間"
        requirement="publish"
        help="1日だけのイベントは、開始日と終了日を同じ日にします。"
        {...optionalError(errors.period)}
      >
        <div className="em-period">
          <Field id="occasion-start" label="開始日">
            {(control) => (
              <Input
                {...control}
                type="date"
                name="start"
                value={values.start}
                disabled={disabled}
                aria-invalid={errors.period === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ start: event.currentTarget.value })
                }
              />
            )}
          </Field>
          <Field id="occasion-end" label="終了日">
            {(control) => (
              <Input
                {...control}
                type="date"
                name="end"
                value={values.end}
                disabled={disabled}
                aria-invalid={errors.period === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ end: event.currentTarget.value })
                }
              />
            )}
          </Field>
        </div>
      </Fieldset>
      <Field
        id="occasion-tagline"
        label="キャッチコピー"
        requirement="optional"
        help="フィードとイベントページで、写真に添えて明朝で示します。"
        {...optionalError(errors.tagline)}
      >
        {(control) => (
          <Input
            {...control}
            name="tagline"
            placeholder="例: 器と喫茶が、通りに並ぶ三日間。"
            value={values.tagline}
            disabled={disabled}
            onChange={(event) =>
              onChange({ tagline: event.currentTarget.value })
            }
          />
        )}
      </Field>
      <Field
        id="occasion-description"
        label="紹介"
        requirement="optional"
        {...optionalError(errors.description)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            placeholder="イベントの内容や、楽しみ方を書きます"
            value={values.description}
            disabled={disabled}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
          />
        )}
      </Field>
      <div className="em-venue">
        <AddressField
          requirement="publish"
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
      </div>
      <PositionField
        idPrefix="occasion"
        legend="開催場所の位置"
        requirement={"publish"}
        subject="開催場所"
        mark="催"
        latitude={values.latitude}
        longitude={values.longitude}
        onChange={onChange}
        error={errors.location}
        disabled={disabled}
      />
    </>
  );
}
