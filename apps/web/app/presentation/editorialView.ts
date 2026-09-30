import type { ErrorState } from "./errorState";
import type { PhotoItem } from "./placeView";
import type { ListPage } from "./regionView";

/*
 * AM-01 読みものの一覧, AM-02 読みものの編集 and CM-03 公開前の確認 of an
 * article: the screens' data as plain serializable values, their words,
 * paths and the form's helpers. Client-safe.
 */

export const ARTICLE_STATUSES = ["draft", "published", "unpublished"] as const;
export type ArticleStatusValue = (typeof ARTICLE_STATUSES)[number];

/** How the editorial screens name a publication state (「管理する対象の状態」). */
export const ARTICLE_STATUS_LABEL = {
  draft: "下書き",
  published: "公開",
  unpublished: "公開の取り下げ",
} as const satisfies Readonly<Record<ArticleStatusValue, string>>;

export const SHOWCASE_KINDS = [
  "listing",
  "place",
  "region",
  "occasion",
] as const;
export type ShowcaseKindValue = (typeof SHOWCASE_KINDS)[number];

export const SHOWCASE_KIND_LABEL = {
  listing: "掲載",
  place: "店舗",
  region: "地域",
  occasion: "イベント",
} as const satisfies Readonly<Record<ShowcaseKindValue, string>>;

/** AM-01's home; the 読みもの編集 brand leads here. */
export const EDITORIAL_HOME = "/editorial";

export const articleEditPath = (articleId: string): string =>
  `/editorial/articles/${encodeURIComponent(articleId)}`;

export const articlePreviewPath = (articleId: string): string =>
  `${articleEditPath(articleId)}/preview`;

/** DT-05, a plain path (the viewer area). */
export const articlePagePath = (articleId: string): string =>
  `/articles/${encodeURIComponent(articleId)}`;

/** DT-01〜DT-04 of a showcased target, a plain path (the viewer area). */
export function showcasePagePath(kind: ShowcaseKindValue, id: string): string {
  const segment = encodeURIComponent(id);
  switch (kind) {
    case "listing":
      return `/listings/${segment}`;
    case "place":
      return `/places/${segment}`;
    case "region":
      return `/regions/${segment}`;
    case "occasion":
      return `/events/${segment}`;
  }
}

/** An article's title as the editorial screens show it; untitled drafts too. */
export const articleTitleText = (title: string | null): string =>
  title === null || title === "" ? "タイトル未入力" : title;

// ---------------------------------------------------------------- AM-01

/** One row of AM-01. */
export type ArticleRow = Readonly<{
  articleId: string;
  title: string | null;
  coverUrl: string | null;
  status: ArticleStatusValue;
  /** 9月25日に保存, 9月20日に公開, 9月24日に更新 */
  dateText: string;
  /**
   * The takedown mark: `photos` while the photos a claim removed are not
   * replaced (CS-16), `unpublished` for an article a claim's removal of its
   * last photo unpublished after new photos were saved.
   */
  takedown: "photos" | "unpublished" | null;
}>;

export type EditorialListData = Readonly<
  Record<ArticleStatusValue, ListPage<ArticleRow>>
>;

/** AM-01's rows per page of a state (CF-05). */
export const ARTICLE_LIST_PAGE_SIZE = 20;

// ---------------------------------------------------------------- AM-02

/**
 * A showcased target (紹介先) as AM-02 lists it, CM-03 shows it and the
 * selection (CF-02) offers it: its current state in the reference scene,
 * or the fact that viewers cannot see it.
 */
export type ShowcaseItem = Readonly<{
  kind: ShowcaseKindValue;
  id: string;
  /** `null` for a target that no longer exists or has no name. */
  name: string | null;
  /** Viewers can see it, so the article shows it. */
  viewable: boolean;
  /** The state line: ベーカリー 灯 · 提供中, 営業中, 開催予定 · 11月7日（土）… */
  stateText: string;
  /** A state told apart (休業, 提供終了, 中止…, 閲覧できません); `null` when ordinary. */
  badge: Readonly<{ text: string; tone: "neutral" | "alert" }> | null;
  /** How the article treats it (記事には休業中として示されます / 記事に表示されません). */
  note: string | null;
  /** The article page's row (content row): the second and third lines. */
  row: Readonly<{ meta: string | null; area: string | null }>;
  photoUrl: string | null;
}>;

/** The showcase's name, or what stands for it when there is none. */
export const showcaseNameText = (item: ShowcaseItem): string =>
  item.name ?? `名称のない${SHOWCASE_KIND_LABEL[item.kind]}`;

export const showcaseKey = (item: Pick<ShowcaseItem, "kind" | "id">): string =>
  `${item.kind}:${item.id}`;

export type PublicationRequirementValue = "title" | "photos" | "body";

export type ArticleEditorData = Readonly<{
  articleId: string;
  /** The version the next save sends (`reviseArticle`). */
  version: number;
  title: string;
  body: string;
  photos: readonly PhotoItem[];
  showcases: readonly ShowcaseItem[];
  status: ArticleStatusValue;
  reason: "byManager" | "photoTakedown" | null;
  /** 下書き · 9月25日に保存 */
  statusText: string;
  /** A claim removed photos and the editor has not changed the photos since (CS-16). */
  photosTakenDown: boolean;
  missing: readonly PublicationRequirementValue[];
}>;

/** CF-02's candidates of one kind. */
export type ShowcaseCandidates = Readonly<
  Record<ShowcaseKindValue, ListPage<ShowcaseItem>>
>;

// ---------------------------------------------------------------- CM-03

export type ArticlePreviewData = Readonly<{
  articleId: string;
  status: ArticleStatusValue;
  title: string | null;
  body: string | null;
  /** The photos in order; the first is the cover. */
  photos: readonly Readonly<{ photoId: string; url: string | null }>[];
  /** The showcases the article page shows, in order. */
  shown: readonly ShowcaseItem[];
  /** The showcases viewers cannot see, left out of the page. */
  hidden: readonly ShowcaseItem[];
  missing: readonly PublicationRequirementValue[];
}>;

// ---------------------------------------------------------------- form

/** The article form's fields, in screen order. */
export const ARTICLE_FIELDS = ["photos", "title", "body", "showcases"] as const;
export type ArticleField = (typeof ARTICLE_FIELDS)[number];

export const ARTICLE_FIELD_LABEL = {
  photos: "写真",
  title: "タイトル",
  body: "本文",
  showcases: "紹介先",
} as const satisfies Readonly<Record<ArticleField, string>>;

export const ARTICLE_FIELD_ANCHOR = {
  photos: "photos",
  title: "article-title",
  body: "article-body",
  showcases: "article-showcases",
} as const satisfies Readonly<Record<ArticleField, string>>;

export type ArticleFieldErrors = Readonly<
  Partial<Record<ArticleField, string>>
>;

export type ArticleFormValues = Readonly<{
  photos: readonly PhotoItem[];
  title: string;
  body: string;
  showcases: readonly ShowcaseItem[];
}>;

export const EMPTY_ARTICLE_FORM: ArticleFormValues = {
  photos: [],
  title: "",
  body: "",
  showcases: [],
};

export const articleFormValuesOf = (
  data: ArticleEditorData,
): ArticleFormValues => ({
  photos: data.photos,
  title: data.title,
  body: data.body,
  showcases: data.showcases,
});

/** The content the transport takes (`createArticleFn`, `reviseArticleFn`). */
export type ArticleContentPayload = Readonly<{
  title: string;
  body: string;
  photoIds: readonly string[];
  showcases: readonly Readonly<{ kind: ShowcaseKindValue; id: string }>[];
}>;

export const toArticleContent = (
  values: ArticleFormValues,
): ArticleContentPayload => ({
  title: values.title,
  body: values.body,
  photoIds: values.photos.map((photo) => photo.photoId),
  showcases: values.showcases.map(({ kind, id }) => ({ kind, id })),
});

/**
 * What the form compares to tell unsaved changes: the content as sent, so
 * a showcase whose state line was refreshed is not a change.
 */
export const articleContentKey = (values: ArticleFormValues): string =>
  JSON.stringify(toArticleContent(values));

const REQUIREMENT_MESSAGE = {
  title: "公開するには、タイトルを入力してください。",
  photos: "公開するには、写真を1枚以上登録してください。",
  body: "公開するには、本文を入力してください。",
} as const satisfies Readonly<Record<PublicationRequirementValue, string>>;

const isRequirement = (value: string): value is PublicationRequirementValue =>
  Object.hasOwn(REQUIREMENT_MESSAGE, value);

/** The publish requirements a failed publish or save says are missing (CF-08). */
export const missingOf = (
  error: ErrorState,
): readonly PublicationRequirementValue[] =>
  error.kind === "invalidInput" ? error.missing.filter(isRequirement) : [];

const FIELD_OF_CODE: Readonly<Record<string, ArticleField>> = {
  ARTICLE_INVALID_TITLE: "title",
  ARTICLE_INVALID_BODY: "body",
  ARTICLE_INVALID_SHOWCASE_LIST: "showcases",
  ARTICLE_DUPLICATE_PHOTO: "photos",
  COMMON_INVALID_PHOTO_ID: "photos",
  MEDIA_PHOTO_NOT_AVAILABLE: "photos",
  MEDIA_PHOTO_NOT_REGISTRANT: "photos",
  MEDIA_PHOTO_ALREADY_OWNED: "photos",
};

const titleLength = (title: string): number => [...title.trim()].length;

/**
 * The fields a failed save or publish points at (CS-10): each unmet
 * publish requirement, the transport's messages per path, and the business
 * code's field with the catalog's sentence. An over-long title says how
 * long it is.
 */
export function articleFieldErrors(
  error: ErrorState,
  values: ArticleFormValues,
): ArticleFieldErrors {
  const errors: Partial<Record<ArticleField, string>> = {};
  for (const requirement of missingOf(error)) {
    errors[requirement] = REQUIREMENT_MESSAGE[requirement];
  }
  if (error.kind === "invalidInput") {
    for (const [path, messages] of Object.entries(error.fieldErrors)) {
      const [head] = path.replace(/^content\./, "").split(".");
      const field =
        head === "photoIds"
          ? "photos"
          : (ARTICLE_FIELDS as readonly string[]).includes(head ?? "")
            ? (head as ArticleField)
            : null;
      const [message] = messages;
      if (field !== null && message !== undefined && !errors[field]) {
        errors[field] = message;
      }
    }
  }
  const field = error.code === null ? undefined : FIELD_OF_CODE[error.code];
  if (field !== undefined && errors[field] === undefined) {
    errors[field] =
      field === "title" && titleLength(values.title) > 100
        ? `${error.message}（いま${titleLength(values.title)}文字）`
        : error.message;
  }
  return errors;
}
