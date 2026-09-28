"use client";

import type { ReactNode } from "react";
import { FramedPhoto } from "@/components/photo/FramedPhoto";
import { PhotoField } from "@/components/photo/PhotoField";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import type {
  ListingField,
  ListingFieldErrors,
  ListingFormValues,
} from "@/presentation/listingForm";
import type { CategoryOption } from "@/presentation/listingView";
import { OfferingField } from "../OfferingField";

type ListingFormFieldsProps = {
  values: ListingFormValues;
  onChange: (change: Partial<ListingFormValues>) => void;
  errors: ListingFieldErrors;
  categories: readonly CategoryOption[];
  place: Readonly<{ id: string; name: string; address: string }>;
  disabled?: boolean;
  /**
   * `required` on an application (RQ-04), which is submitted only when it
   * meets the publish condition; `publish` (the default) on SM-04, whose
   * drafts may leave it unmet.
   */
  requirement?: "publish" | "required";
  /** Stands in for the 掲載する店舗 block (RQ-04 shows the application's target above the form). */
  target?: ReactNode;
  /** A line after a field, e.g. a revision application's 「変更」 with the current value. */
  notes?: Readonly<Partial<Record<ListingField, ReactNode>>>;
};

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * The listing's content as SM-04 edits it: photos with their framing
 * (CF-01), name, category, description and the offering (CF-06). Photo,
 * name and category are the publish condition (CF-08); a draft may leave
 * any of them empty. The store and its address come from the store.
 */
export function ListingFormFields({
  values,
  onChange,
  errors,
  categories,
  place,
  disabled = false,
  requirement = "publish",
  target,
  notes = {},
}: ListingFormFieldsProps) {
  const [cover] = values.photos;
  return (
    <>
      {cover === undefined ? (
        <div className="sm04-photo-empty">写真はまだありません</div>
      ) : (
        <FramedPhoto
          url={cover.url}
          framing={cover.framing}
          alt={`${values.name === "" ? "掲載" : values.name}（代表写真）`}
          ratio={348 / 220}
          className="sm04-photo"
        />
      )}
      <PhotoField
        id="photos"
        items={values.photos}
        onChange={(photos) => onChange({ photos })}
        requirement={requirement}
        addLabel="写真を追加"
        help="1枚目が代表写真になります。写真ごとに、閲覧者に見せる範囲を調整できます。自分で撮影した写真か、許諾を得た写真だけを登録できます。"
        withFraming
        disabled={disabled}
        {...optionalError(errors.photos)}
      />
      {notes.photos}
      <Field
        id="listing-name"
        label="名称"
        requirement={requirement}
        help={
          requirement === "publish"
            ? "写真・名称・カテゴリーがあれば公開できます。下書きは、空の項目があっても保存できます。"
            : "写真・名称・カテゴリーは、提出に必要です。"
        }
        {...optionalError(errors.name)}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder="例: いちじくのパフェ"
            value={values.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        )}
      </Field>
      {notes.name}
      <Field
        id="listing-category"
        label="カテゴリー"
        requirement={requirement}
        {...optionalError(errors.category)}
      >
        {(control) => (
          <Select
            {...control}
            name="category"
            value={values.categoryId}
            disabled={disabled}
            onChange={(event) =>
              onChange({ categoryId: event.currentTarget.value })
            }
          >
            <option value="">選ぶ</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {notes.category}
      <Field
        id="listing-description"
        label="紹介文"
        requirement="optional"
        {...optionalError(errors.description)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            placeholder="どんな品や体験かを書きます"
            value={values.description}
            disabled={disabled}
            onChange={(event) =>
              onChange({ description: event.currentTarget.value })
            }
          />
        )}
      </Field>
      {notes.description}
      <OfferingField
        value={values.offering}
        onChange={(offering) => onChange({ offering })}
        disabled={disabled}
        {...optionalError(errors.offering)}
      />
      {notes.offering}
      {target !== undefined ? (
        target
      ) : (
        <div className="m-field">
          <p className="m-field__label">掲載する店舗</p>
          <LinkList>
            <li>
              <ListRowLink
                to="/manage/places/$placeId/info"
                params={{ placeId: place.id }}
                title={place.name}
                meta={place.address}
              />
            </li>
          </LinkList>
          <p className="m-field__help">
            所在地と所属地域は、店舗情報から引いて示します。
          </p>
        </div>
      )}
    </>
  );
}
