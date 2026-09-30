// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.

import type { ArticleContentFields } from "@repo/core/application/article/articles";
import { createArticle } from "@repo/core/application/article/createArticle";
import { getArticleForEditing } from "@repo/core/application/article/getArticleForEditing";
import { listArticlesForEditing } from "@repo/core/application/article/listArticlesForEditing";
import { previewArticle } from "@repo/core/application/article/previewArticle";
import { publishArticle } from "@repo/core/application/article/publishArticle";
import { reviseArticle } from "@repo/core/application/article/reviseArticle";
import { unpublishArticle } from "@repo/core/application/article/unpublishArticle";
import { getMyAuthority } from "@repo/core/application/authority/getMyAuthority";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { findSelectionCandidates } from "@repo/core/application/discovery/findSelectionCandidates";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import { ForbiddenError } from "@repo/core/application/errors";
import type { Article } from "@repo/core/domain/article/article";
import { Address } from "@repo/core/domain/common/address";
import { ArticleId, PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { Version } from "@repo/core/domain/common/version";
import type { SelectionScope } from "@repo/core/domain/discovery/selectionScope";
import type {
  ListingSummary,
  OccasionSummary,
  PlaceSummary,
  RegionSummary,
  ShowcasePreview,
  ShowcaseSummary,
} from "@repo/core/domain/discovery/viewProjection";
import { requireActor } from "./actor";
import { formatDay, HOLDING_STATUS_TEXT, periodText } from "./detailView";
import type {
  ArticleContentInput,
  ArticlePublicationChange,
} from "./editorial";
import {
  ARTICLE_LIST_PAGE_SIZE,
  type ArticleEditorData,
  type ArticlePreviewData,
  type ArticleRow,
  type ArticleStatusValue,
  type EditorialListData,
  type ShowcaseCandidates,
  type ShowcaseItem,
  type ShowcaseKindValue,
  type ViewableShowcaseItem,
} from "./editorialView";
import { dayText } from "./moderation";
import { OPERATING_STATUS_LABEL } from "./placeView";
import type { ListPage } from "./regionView";
import { parseTargetId } from "./targetIds";
import { parseGeneratedId } from "./validator";

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

const articleIdOf = (raw: string): ArticleId =>
  parseTargetId(ArticleId.create, raw, "ARTICLE_NOT_FOUND");

const todayText = (container: RequestContainer): string =>
  LocalDate.fromInstant(container.clock.now());

/** See `requireEditorFn`. */
export async function requireEditor(): Promise<void> {
  const { container, actor } = await actorAndContainer();
  const { roles } = await getMyAuthority({
    container,
    actor,
    input: { pagination: { page: 1, limit: 1 } },
  });
  if (!roles.includes("editor")) {
    throw new ForbiddenError(
      "EDITOR_REQUIRED",
      "Only editors may open the editorial screens",
    );
  }
}

// ---------------------------------------------------------------- AM-01

const urlOf = (photos: PhotoRefs, photoId: PhotoId | undefined) =>
  photoId === undefined ? null : (photos[photoId]?.url ?? null);

/** The row's date: when it was saved, published, or last changed. */
function dateText(article: Article): string {
  const { publication } = article;
  switch (publication.status) {
    case "draft":
      return `${dayText(article.updatedAt.toISOString())}に保存`;
    case "published":
      return `${dayText(publication.firstPublishedAt.toISOString())}に公開`;
    case "unpublished":
      return `${dayText(article.updatedAt.toISOString())}に更新`;
  }
}

function articleRow(article: Article, photos: PhotoRefs): ArticleRow {
  const { publication, content } = article;
  return {
    articleId: article.id,
    title: content.title,
    coverUrl: urlOf(photos, content.photos.items[0]?.photoId),
    status: publication.status,
    dateText: dateText(article),
    takedown: content.photos.takenDown
      ? "photos"
      : publication.status === "unpublished" &&
          publication.reason === "photoTakedown"
        ? "unpublished"
        : null,
  };
}

/** AM-01: a page of one state's articles, most recently changed first. */
export async function loadArticleRows(
  status: ArticleStatusValue,
  pagination: Pagination,
): Promise<ListPage<ArticleRow>> {
  const { container, actor } = await actorAndContainer();
  const page = await listArticlesForEditing({
    container,
    actor,
    input: { status, pagination },
  });
  return {
    items: page.items.map((article) => articleRow(article, page.photos)),
    count: page.count,
  };
}

/** AM-01: the first page of every state. */
export async function loadEditorialList(): Promise<EditorialListData> {
  const first = { page: 1, limit: ARTICLE_LIST_PAGE_SIZE };
  const [draft, published, unpublished] = await Promise.all([
    loadArticleRows("draft", first),
    loadArticleRows("published", first),
    loadArticleRows("unpublished", first),
  ]);
  return { draft, published, unpublished };
}

// ---------------------------------------------------------------- 紹介先

const localityText = (address: Address): string =>
  `${address.municipality}・${address.town}`;

const coverUrl = (
  photos: PhotoRefs,
  cover: Readonly<{ photoId: PhotoId }> | null,
): string | null => (cover === null ? null : urlOf(photos, cover.photoId));

function listingItem(
  summary: ListingSummary,
  photos: PhotoRefs,
  today: string,
): ViewableShowcaseItem {
  const { offering, operating } = summary.standing;
  const offeringWord =
    offering.phase === "available"
      ? "提供中"
      : offering.phase === "upcoming"
        ? `提供開始前（${formatDay(offering.startsOn, today)}から）`
        : "提供終了";
  const closed = operating !== "open";
  return {
    kind: "listing",
    id: summary.listingId,
    name: summary.listingName,
    viewable: true,
    stateText: `${summary.placeName} · ${offeringWord}`,
    badge:
      offering.phase === "ended"
        ? { text: "提供終了", tone: "neutral" }
        : offering.phase === "upcoming"
          ? { text: "提供開始前", tone: "neutral" }
          : closed
            ? { text: OPERATING_STATUS_LABEL[operating], tone: "neutral" }
            : null,
    note:
      offering.phase === "ended"
        ? "記事には提供終了として示されます"
        : offering.phase === "upcoming"
          ? "記事には提供開始前として示されます"
          : closed
            ? `記事には店舗の${OPERATING_STATUS_LABEL[operating]}とともに示されます`
            : null,
    row: { meta: summary.placeName, area: summary.region },
    photoUrl: coverUrl(photos, summary.cover),
  };
}

function placeItem(
  summary: PlaceSummary,
  photos: PhotoRefs,
): ViewableShowcaseItem {
  const { operating } = summary.standing;
  const label = OPERATING_STATUS_LABEL[operating];
  return {
    kind: "place",
    id: summary.placeId,
    name: summary.name,
    viewable: true,
    stateText: `${localityText(summary.address)} · ${label}`,
    badge: operating === "open" ? null : { text: label, tone: "neutral" },
    note:
      operating === "open"
        ? null
        : `記事には${operating === "temporarilyClosed" ? "休業中" : "閉店"}として示されます`,
    row: { meta: localityText(summary.address), area: summary.region },
    photoUrl: coverUrl(photos, summary.cover),
  };
}

function regionItem(
  summary: RegionSummary,
  photos: PhotoRefs,
): ViewableShowcaseItem {
  return {
    kind: "region",
    id: summary.regionId,
    name: summary.name,
    viewable: true,
    stateText: `${localityText(summary.address)} · 公開`,
    badge: null,
    note: null,
    row: { meta: summary.tagline, area: localityText(summary.address) },
    photoUrl: coverUrl(photos, summary.cover),
  };
}

function occasionItem(
  summary: OccasionSummary,
  photos: PhotoRefs,
  today: string,
): ViewableShowcaseItem {
  const { holding } = summary.standing;
  const holdingText = HOLDING_STATUS_TEXT[holding];
  const period = periodText(summary.period, today);
  const told = holding === "ended" || holding === "cancelled";
  return {
    kind: "occasion",
    id: summary.occasionId,
    name: summary.name,
    viewable: true,
    stateText: `${holdingText} · ${period}`,
    badge: told ? { text: holdingText, tone: "neutral" } : null,
    note: told ? `記事には${holdingText}として示されます` : null,
    row: { meta: period, area: Address.text(summary.venue.address) },
    photoUrl: coverUrl(photos, summary.cover),
  };
}

function summaryItem(
  showcase: ShowcaseSummary,
  photos: PhotoRefs,
  today: string,
): ViewableShowcaseItem {
  switch (showcase.kind) {
    case "listing":
      return listingItem(showcase.summary, photos, today);
    case "place":
      return placeItem(showcase.summary, photos);
    case "region":
      return regionItem(showcase.summary, photos);
    case "occasion":
      return occasionItem(showcase.summary, photos, today);
  }
}

function showcaseItems(
  container: RequestContainer,
  showcases: readonly ShowcasePreview[],
  photos: PhotoRefs,
): readonly ShowcaseItem[] {
  const today = todayText(container);
  return showcases.map(
    (showcase): ShowcaseItem =>
      showcase.viewable
        ? summaryItem(showcase.showcase, photos, today)
        : { kind: showcase.ref.kind, id: showcase.ref.id, viewable: false },
  );
}

// ---------------------------------------------------------------- AM-02

/** The takedown wording lasts until the editor saves changed photos (CS-16). */
function statusText(article: Article): string {
  const { publication } = article;
  switch (publication.status) {
    case "draft":
      return `下書き · ${dateText(article)}`;
    case "published":
      return `公開中 · ${dateText(article)}`;
    case "unpublished":
      return publication.reason === "photoTakedown" &&
        article.content.photos.takenDown
        ? "公開の取り下げ · 申立てで写真が削除されました"
        : `公開の取り下げ · ${dateText(article)}`;
  }
}

/** AM-02: one article for editing, whoever created it. */
export async function loadArticleEditor(
  rawArticleId: string,
): Promise<ArticleEditorData> {
  const { container, actor } = await actorAndContainer();
  const view = await getArticleForEditing({
    container,
    actor,
    input: { articleId: articleIdOf(rawArticleId) },
  });
  const { article } = view;
  const { publication, content } = article;
  return {
    articleId: article.id,
    version: article.version,
    title: content.title ?? "",
    body: content.body ?? "",
    photos: content.photos.items.map(({ photoId }) => ({
      photoId,
      url: urlOf(view.photos, photoId) ?? "",
    })),
    showcases: showcaseItems(container, view.showcases, view.photos),
    status: publication.status,
    reason: publication.status === "unpublished" ? publication.reason : null,
    statusText: statusText(article),
    photosTakenDown: view.photosTakenDown,
    missing: view.missingRequirements,
  };
}

/**
 * The transport's content as the usecases take it. Showcase ids are
 * minted by the id generator like every aggregate id, so a crafted one is
 * refused here as input rather than read as a missing target.
 */
function contentOf(
  container: RequestContainer,
  input: ArticleContentInput,
): ArticleContentFields {
  return {
    title: input.title,
    body: input.body,
    photoIds: input.photoIds.map(PhotoId.create),
    showcases: input.showcases.map(({ kind, id }, index) => ({
      kind,
      id: parseGeneratedId(
        container.idGenerator,
        `content.showcases.${index}.id`,
        id,
      ),
    })),
  };
}

/** AM-02 新規: creates the article as a draft; a replay answers the stored one. */
export async function createArticleAsEditor(
  rawArticleId: string,
  input: ArticleContentInput,
): Promise<Readonly<{ articleId: string; version: number }>> {
  const { container, actor } = await actorAndContainer();
  const { article } = await createArticle({
    container,
    actor,
    input: {
      articleId: parseGeneratedId(
        container.idGenerator,
        "articleId",
        rawArticleId,
      ),
      content: contentOf(container, input),
    },
  });
  return { articleId: article.id, version: article.version };
}

/** AM-02: saves the whole content; answers the version the next save sends. */
export async function reviseArticleAsEditor(
  rawArticleId: string,
  version: number,
  input: ArticleContentInput,
): Promise<Readonly<{ version: number }>> {
  const { container, actor } = await actorAndContainer();
  const { article } = await reviseArticle({
    container,
    actor,
    input: {
      articleId: articleIdOf(rawArticleId),
      version: Version.create(version),
      content: contentOf(container, input),
    },
  });
  return { version: article.version };
}

/** AM-02 / CM-03 (CF-08): publish, or 公開の取り下げ. */
export async function changeArticlePublication(
  rawArticleId: string,
  change: ArticlePublicationChange,
): Promise<Readonly<{ version: number; status: ArticleStatusValue }>> {
  const { container, actor } = await actorAndContainer();
  const input = { articleId: articleIdOf(rawArticleId) };
  const article =
    change === "publish"
      ? await publishArticle({ container, actor, input })
      : await unpublishArticle({ container, actor, input });
  return { version: article.version, status: article.publication.status };
}

// ---------------------------------------------------------------- CF-02

const CANDIDATE_LIMIT = 10;

const SCOPES = {
  listing: { kind: "listing" },
  place: { kind: "place", vacantOnly: false },
  region: { kind: "region" },
  occasion: { kind: "occasion", openOnly: false },
} as const satisfies Readonly<Record<ShowcaseKindValue, SelectionScope>>;

async function candidatesOf(
  container: RequestContainer,
  kind: ShowcaseKindValue,
  keyword: string,
  today: string,
): Promise<ListPage<ViewableShowcaseItem>> {
  const { candidates, photos } = await findSelectionCandidates({
    container,
    input: {
      scope: SCOPES[kind],
      keyword,
      pagination: { page: 1, limit: CANDIDATE_LIMIT },
    },
  });
  switch (candidates.kind) {
    case "listing":
      return {
        items: candidates.items.map((item) => listingItem(item, photos, today)),
        count: candidates.count,
      };
    case "place":
      return {
        items: candidates.items.map((item) => placeItem(item.summary, photos)),
        count: candidates.count,
      };
    case "region":
      return {
        items: candidates.items.map((item) => regionItem(item, photos)),
        count: candidates.count,
      };
    case "occasion":
      return {
        items: candidates.items.map((item) =>
          occasionItem(item, photos, today),
        ),
        count: candidates.count,
      };
  }
}

/**
 * AM-02 CF-02: the listings, places, regions and events viewers can see
 * that match `keyword`, each kind apart. Which ones are already linked is
 * the form's to tell (its unsaved list is the truth).
 */
export async function findShowcaseCandidates(
  keyword: string,
): Promise<ShowcaseCandidates> {
  const { container } = await actorAndContainer();
  const today = todayText(container);
  const [listing, place, region, occasion] = await Promise.all([
    candidatesOf(container, "listing", keyword, today),
    candidatesOf(container, "place", keyword, today),
    candidatesOf(container, "region", keyword, today),
    candidatesOf(container, "occasion", keyword, today),
  ]);
  return { listing, place, region, occasion };
}

// ---------------------------------------------------------------- CM-03

/** CM-03 of an article: the saved content as viewers would see it. */
export async function loadArticlePreview(
  rawArticleId: string,
): Promise<ArticlePreviewData> {
  const { container, actor } = await actorAndContainer();
  const articleId = articleIdOf(rawArticleId);
  const output = await previewArticle({
    container,
    actor,
    input: { articleId },
  });
  const { detail } = output.preview;
  const today = todayText(container);
  return {
    articleId,
    status: output.status,
    title: detail.title,
    body: detail.body,
    photos: detail.photos.map(({ photoId }) => ({
      photoId,
      url: urlOf(output.photos, photoId),
    })),
    shown: detail.showcases.flatMap((showcase) =>
      showcase.viewable
        ? [summaryItem(showcase.showcase, output.photos, today)]
        : [],
    ),
    hidden: detail.showcases.flatMap((showcase, index) =>
      showcase.viewable ? [] : [index + 1],
    ),
    missing: output.missingRequirements,
  };
}
