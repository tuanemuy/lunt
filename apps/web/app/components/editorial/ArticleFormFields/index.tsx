"use client";

import { PhotoField } from "@/components/photo/PhotoField";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type {
  ArticleFieldErrors,
  ArticleFormValues,
} from "@/presentation/editorialView";
import { ShowcaseField } from "../ShowcaseField";

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * An article's content as AM-02 edits it: photos (CF-01, no framing),
 * title, body, and the showcased targets (CF-02). Title, photos and body
 * are the publish requirements (CF-08); a draft may leave any empty.
 */
export function ArticleFormFields({
  values,
  onChange,
  errors,
  disabled = false,
  emptyPhotoText,
}: {
  values: ArticleFormValues;
  onChange: (change: Partial<ArticleFormValues>) => void;
  errors: ArticleFieldErrors;
  disabled?: boolean;
  /** The photo band's text when there is none (CS-16: 写真は削除されました). */
  emptyPhotoText?: string;
}) {
  return (
    <>
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
        help={
          values.photos.length === 0 && emptyPhotoText !== undefined
            ? `${emptyPhotoText}。1枚目が代表写真になります。自分で撮影した写真か、許諾を得た写真だけを登録できます。登録のたびに、Lunt での利用への同意を確かめます。写真の変更は、保存で反映します。`
            : "1枚目が代表写真になります。自分で撮影した写真か、許諾を得た写真だけを登録できます。登録のたびに、Lunt での利用への同意を確かめます。写真の変更は、保存で反映します。"
        }
        disabled={disabled}
        {...optionalError(errors.photos)}
      />
      <Field
        id="article-title"
        label="タイトル"
        requirement="publish"
        {...optionalError(errors.title)}
      >
        {(control) => (
          <Input
            {...control}
            name="title"
            placeholder="例: 白波横丁、夜の灯り"
            value={values.title}
            disabled={disabled}
            onChange={(event) => onChange({ title: event.currentTarget.value })}
          />
        )}
      </Field>
      <Field
        id="article-body"
        label="本文"
        requirement="publish"
        help="本文は、紹介先の変化で自動では書き換わりません。"
        {...optionalError(errors.body)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="body"
            rows={8}
            className="am02-text"
            placeholder="紹介したい店や、まちの様子を書きます"
            value={values.body}
            disabled={disabled}
            onChange={(event) => onChange({ body: event.currentTarget.value })}
          />
        )}
      </Field>
      <hr className="m-divider" />
      <ShowcaseField
        items={values.showcases}
        onChange={(showcases) => onChange({ showcases })}
        disabled={disabled}
        {...optionalError(errors.showcases)}
      />
    </>
  );
}
