import type { ReadArticleOutput } from "@repo/core/application/discovery/readArticle";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import type {
  ArticleSummary,
  ShowcaseSummary,
} from "@repo/core/domain/discovery/viewProjection";
import {
  type ArticleRowItem,
  articleRow,
  type DetailPhoto,
  type ListingCardItem,
  listingCard,
  type OccasionRowItem,
  occasionRow,
  type PlaceRowItem,
  photoSource,
  placeRow,
  type RegionRowItem,
  regionRow,
} from "./detailView";
import { closureText } from "./discoverView";

/**
 * What VW-09 読む, DT-05 記事 and the 読みもの sections of DT-01〜DT-04 show,
 * as plain serializable data built on the server from `listArticles`,
 * `readArticle` and `listArticlesShowcasing` (`spec/pages/browse.md`,
 * `spec/pages/detail.md`).
 */

/** Articles per page of VW-09 (CF-05). */
export const ARTICLES_PAGE_SIZE = 10;

/** A 読みもの section of DT-01〜DT-04: 3, the rest by CF-05 (「詳細の関連情報」). */
export const ARTICLE_SECTION_PAGE_SIZE = 3;

/** A page of articles, newest first (VW-09, a detail's 読みもの section). */
export type ArticlesPage = Readonly<{
  items: readonly ArticleRowItem[];
  count: number;
}>;

/** The kinds an article showcases, whose details carry a 読みもの section. */
export const SHOWCASE_KINDS = [
  "listing",
  "place",
  "region",
  "occasion",
] as const;

export type ShowcaseKind = (typeof SHOWCASE_KINDS)[number];

/** The target whose showcasing articles a detail's 読みもの section lists. */
export type ShowcaseTarget = Readonly<{ kind: ShowcaseKind; id: string }>;

/** A detail's data with the first page of its 読みもの section. */
export type WithArticles<T> = T & Readonly<{ articles: ArticlesPage }>;

export function toArticlesPage(
  output: Readonly<{
    items: readonly ArticleSummary[];
    count: number;
    photos: PhotoRefs;
  }>,
): ArticlesPage {
  return {
    items: output.items.map((summary) => articleRow(summary, output.photos)),
    count: output.count,
  };
}

/**
 * A showcased target as DT-05 lists it, in the reference scene: a
 * listing's offering state and its place's closure, a place's closure, an
 * occasion's holding status (`OccasionRowItem.holding`).
 */
export type ShowcaseItem =
  | Readonly<{
      kind: "listing";
      listing: ListingCardItem;
      closure: string | null;
    }>
  | Readonly<{ kind: "place"; place: PlaceRowItem }>
  | Readonly<{ kind: "region"; region: RegionRowItem }>
  | Readonly<{ kind: "occasion"; occasion: OccasionRowItem }>;

export function showcaseItemKey(item: ShowcaseItem): string {
  switch (item.kind) {
    case "listing":
      return `listing:${item.listing.listingId}`;
    case "place":
      return `place:${item.place.placeId}`;
    case "region":
      return `region:${item.region.regionId}`;
    case "occasion":
      return `occasion:${item.occasion.occasionId}`;
  }
}

/** A showcase's row, worded against `today`. */
export function showcaseItem(
  showcase: ShowcaseSummary,
  refs: PhotoRefs,
  today: string,
): ShowcaseItem {
  switch (showcase.kind) {
    case "listing":
      return {
        kind: "listing",
        listing: listingCard(showcase.summary, refs, today),
        closure: closureText(showcase.summary.standing.operating),
      };
    case "place":
      return { kind: "place", place: placeRow(showcase.summary, refs) };
    case "region":
      return { kind: "region", region: regionRow(showcase.summary, refs) };
    case "occasion":
      return {
        kind: "occasion",
        occasion: occasionRow(showcase.summary, refs, today),
      };
  }
}

/**
 * DT-05's article: title, photos in registration order (the first is the
 * cover), body as written, and the viewable showcases in the editor's
 * order.
 */
export type ArticleDetailData = Readonly<{
  articleId: string;
  title: string;
  photos: readonly DetailPhoto[];
  body: string;
  showcases: readonly ShowcaseItem[];
}>;

/** DT-05's screen: the article, or CS-06 when it is not viewable. */
export type ArticleScreen =
  | Readonly<{ kind: "ready"; article: ArticleDetailData }>
  | Readonly<{ kind: "unavailable" }>;

export function toArticleDetailData(
  output: ReadArticleOutput,
  today: string,
): ArticleDetailData {
  const { article, photos } = output;
  return {
    articleId: article.articleId,
    title: article.title,
    photos: article.photos.map((photo, index) => ({
      photo: photoSource(photos, photo.photoId, null),
      alt: index === 0 ? article.title : `${article.title}（${index + 1}枚目）`,
    })),
    body: article.body,
    showcases: article.showcases.map((showcase) =>
      showcaseItem(showcase, photos, today),
    ),
  };
}
