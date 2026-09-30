import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { ArticleId, PhotoId } from "@repo/core/domain/common/ids";
import {
  PhotosReleasedEvent,
  PhotosTakenDownEvent,
} from "@repo/core/domain/common/photoEvents";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import {
  type DraftPublication,
  Publication,
  PublishConditionUnmetError,
  type PublishedPublication,
  type UnpublishedPublication,
  type UnpublishReason,
} from "@repo/core/domain/common/publication";
import { type ShowcaseKind, ShowcaseRef } from "@repo/core/domain/common/refs";
import type { SearchableText } from "@repo/core/domain/common/searchKeyword";
import { Version } from "@repo/core/domain/common/version";
import { RehydrationError } from "@repo/core/domain/error";
import { ArticleBody, ArticleTitle, ShowcaseList } from "./values";

export type ArticlePhoto = Readonly<{ photoId: PhotoId }>;

/** Title, body, photos (the first is the cover) and showcased targets. Any may be empty while not published. */
export type ArticleContent = Readonly<{
  title: ArticleTitle | null;
  body: ArticleBody | null;
  photos: PhotoSet<ArticlePhoto>;
  showcases: ShowcaseList;
}>;

/** Content meeting the publish condition: a title, a body and at least one photo. */
export type PublishableArticleContent = ArticleContent &
  Readonly<{
    title: ArticleTitle;
    body: ArticleBody;
    photos: PhotoSet<ArticlePhoto> &
      Readonly<{ items: readonly [ArticlePhoto, ...ArticlePhoto[]] }>;
  }>;

type ArticleBase = Readonly<{
  id: ArticleId;
  version: Version;
  /** When the content or the publication last changed; orders the editing list. */
  updatedAt: Date;
}>;

export type DraftArticle = ArticleBase &
  Readonly<{ publication: DraftPublication; content: ArticleContent }>;

export type PublishedArticle = ArticleBase &
  Readonly<{
    publication: PublishedPublication;
    content: PublishableArticleContent;
  }>;

export type UnpublishedArticle = ArticleBase &
  Readonly<{ publication: UnpublishedPublication; content: ArticleContent }>;

/**
 * An article (読みもの). It belongs to the whole service, has no
 * suspension and is never deleted. One variant per publication state, so a
 * published article lacking the publish condition cannot be represented.
 */
export type Article = DraftArticle | PublishedArticle | UnpublishedArticle;

export type ArticleStatus = Article["publication"]["status"];

/** A publish requirement, in the order `missingRequirements` reports them. */
export type PublicationRequirement = "title" | "photos" | "body";

/** Raw content of a create or a save. Blank title / body mean "not entered". */
export type ArticleContentInput = Readonly<{
  title: string;
  body: string;
  photoIds: readonly PhotoId[];
  showcases: readonly ShowcaseRef[];
}>;

export type ArticleEvent = PhotosTakenDownEvent | PhotosReleasedEvent;

/** The at-rest form of an article, in primitives. */
export type ArticleSnapshot = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  content: Readonly<{
    title: string | null;
    body: string | null;
    photoIds: readonly string[];
    photosTakenDown: boolean;
    showcases: readonly Readonly<{ kind: string; id: string }>[];
  }>;
  updatedAt: Date;
  version: number;
}>;

const SUBJECT = "ARTICLE";

const NOT_SUSPENDED = { suspended: false } as const;

const blankToNull = (input: string): string | null =>
  input.trim().length === 0 ? null : input;

function contentOf(input: ArticleContentInput): ArticleContent {
  const title = blankToNull(input.title);
  const body = blankToNull(input.body);
  return {
    title: title === null ? null : ArticleTitle.create(title),
    body: body === null ? null : ArticleBody.create(body),
    photos: PhotoSet.of(
      input.photoIds.map((photoId): ArticlePhoto => ({ photoId })),
      SUBJECT,
    ),
    showcases: ShowcaseList.create(input.showcases),
  };
}

function missingRequirements(
  content: ArticleContent,
): readonly PublicationRequirement[] {
  const missing: PublicationRequirement[] = [];
  if (content.title === null) missing.push("title");
  if (PhotoSet.isEmpty(content.photos)) missing.push("photos");
  if (content.body === null) missing.push("body");
  return missing;
}

const isPublishable = (
  content: ArticleContent,
): content is PublishableArticleContent =>
  missingRequirements(content).length === 0;

/** Throws `ARTICLE_PUBLISH_CONDITION_UNMET` carrying `missingRequirements`. */
function toPublishable(content: ArticleContent): PublishableArticleContent {
  if (isPublishable(content)) return content;
  const [first, ...rest] = missingRequirements(content);
  throw new PublishConditionUnmetError<"ARTICLE", PublicationRequirement>(
    SUBJECT,
    [first ?? "photos", ...rest],
  );
}

const samePhotos = (
  a: PhotoSet<ArticlePhoto>,
  b: PhotoSet<ArticlePhoto>,
): boolean =>
  a.takenDown === b.takenDown &&
  a.items.length === b.items.length &&
  a.items.every((photo, i) => photo.photoId === b.items[i]?.photoId);

const contentEquals = (a: ArticleContent, b: ArticleContent): boolean =>
  a.title === b.title &&
  a.body === b.body &&
  samePhotos(a.photos, b.photos) &&
  ShowcaseList.equals(a.showcases, b.showcases);

const isPublished = (article: Article): article is PublishedArticle =>
  article.publication.status === "published";

const exposure = (article: Article) => ({
  publication: article.publication,
  suspension: NOT_SUSPENDED,
});

const ownerOf = (id: ArticleId) => ({ kind: "article", id }) as const;

/**
 * `content` in place of the article's, keeping its state, with the version
 * advanced. A published article's content must be publishable.
 */
function withContent(
  article: Article,
  content: ArticleContent,
  now: Date,
): Article {
  const base = {
    id: article.id,
    version: Version.next(article.version),
    updatedAt: now,
  };
  switch (article.publication.status) {
    case "draft":
      return { ...base, publication: article.publication, content };
    case "published":
      return {
        ...base,
        publication: article.publication,
        content: toPublishable(content),
      };
    case "unpublished":
      return { ...base, publication: article.publication, content };
  }
}

/**
 * A draft built from `content` (value-object errors: `ARTICLE_INVALID_TITLE`,
 * `ARTICLE_INVALID_BODY`, `ARTICLE_DUPLICATE_PHOTO`,
 * `ARTICLE_INVALID_SHOWCASE_LIST`). No publish check; no event. Every
 * photo is returned in `addedPhotoIds` for the caller to claim.
 */
function create(
  params: Readonly<{ id: ArticleId; content: ArticleContentInput }>,
  now: Date,
): Readonly<{ entity: DraftArticle; addedPhotoIds: readonly PhotoId[] }> {
  const content = contentOf(params.content);
  return {
    entity: {
      id: params.id,
      publication: Publication.draft(),
      content,
      version: Version.initial(),
      updatedAt: now,
    },
    addedPhotoIds: PhotoSet.photoIds(content.photos),
  };
}

/**
 * Replaces the whole content, keeping the publication state. A published
 * article must stay publishable (`ARTICLE_PUBLISH_CONDITION_UNMET`). Photos
 * that left go out in `photos.released`; photos that joined come back in
 * `addedPhotoIds`. Unchanged content returns the article as it is.
 */
function revise(
  article: Article,
  input: ArticleContentInput,
  now: Date,
): WithEventDrafts<Article, PhotosReleasedEvent> &
  Readonly<{ addedPhotoIds: readonly PhotoId[] }> {
  const built = contentOf(input);
  const photos = PhotoSet.replace(article.content.photos, built.photos.items);
  const content: ArticleContent = { ...built, photos };
  if (contentEquals(article.content, content)) {
    return { entity: article, eventDrafts: [], addedPhotoIds: [] };
  }
  const entity = withContent(article, content, now);
  const before = new Set(PhotoSet.photoIds(article.content.photos));
  return {
    entity,
    eventDrafts: PhotosReleasedEvent.draftsFor(
      ownerOf(article.id),
      PhotoSet.removedPhotoIds(article.content.photos, photos),
      now,
    ),
    addedPhotoIds: PhotoSet.photoIds(photos).filter((id) => !before.has(id)),
  };
}

/**
 * Publishes a draft or re-publishes an unpublished article. The order of
 * checks (invalid transition, then unmet condition) is `Publication.publish`'s.
 * The showcases are not a condition.
 */
function publish(article: Article, now: Date): PublishedArticle {
  const publication = Publication.publish(
    exposure(article),
    missingRequirements(article.content),
    now,
    SUBJECT,
  );
  return {
    id: article.id,
    publication,
    content: toPublishable(article.content),
    version: Version.next(article.version),
    updatedAt: now,
  };
}

function unpublishedFrom(
  article: Article,
  reason: UnpublishReason,
  content: ArticleContent,
  now: Date,
): UnpublishedArticle {
  return {
    id: article.id,
    publication: Publication.unpublish(exposure(article), reason, SUBJECT),
    content,
    version: Version.next(article.version),
    updatedAt: now,
  };
}

/** Unpublishes by an editor (`byManager`), keeping content and showcases. */
function unpublish(article: Article, now: Date): UnpublishedArticle {
  return unpublishedFrom(article, "byManager", article.content, now);
}

/**
 * Removes photos on a takedown claim. A published article left without
 * photos becomes `unpublished` (`photoTakedown`); a draft or an unpublished
 * article keeps its state and reason. Throws `ARTICLE_PHOTO_NOT_FOUND`
 * (removing none) when an id is not the article's.
 */
function takeDownPhotos(
  article: Article,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): WithEventDrafts<Article, ArticleEvent> {
  const photos = PhotoSet.takeDown(article.content.photos, photoIds, SUBJECT);
  const content: ArticleContent = { ...article.content, photos };
  const becomesUnpublished = isPublished(article) && PhotoSet.isEmpty(photos);
  const entity: Article = becomesUnpublished
    ? unpublishedFrom(article, "photoTakedown", content, now)
    : withContent(article, content, now);
  const owner = ownerOf(article.id);
  return {
    entity,
    eventDrafts: [
      PhotosTakenDownEvent.draft(
        { owner, photoIds, unpublished: becomesUnpublished },
        now,
      ),
      PhotosReleasedEvent.draft(owner, photoIds, now),
    ],
  };
}

/** The fields `searchableTextOf` reads; a stored row's `title` / `body` fit as they are. */
export type ArticleSearchFields = Readonly<{
  title: string | null;
  body: string | null;
}>;

/**
 * The text keyword matching scores: the title as `primary` (empty when
 * none) and the body, if any, as `secondary`. Pure over the two fields, so
 * a store can score rows without rebuilding the aggregate.
 */
function searchableTextOf(fields: ArticleSearchFields): SearchableText {
  return {
    primary: fields.title ?? "",
    secondary: fields.body === null ? [] : [fields.body],
  };
}

/** `searchableTextOf` the article's content. */
const searchableText = (article: Article): SearchableText =>
  searchableTextOf(article.content);

/**
 * Whether `input` is the article's content — the replay test of an
 * idempotent create. Compares the normalised title and body, the photo
 * sequence and the showcase sequence; never throws on invalid input.
 */
function sameContent(article: Article, input: ArticleContentInput): boolean {
  const { content } = article;
  const title = blankToNull(input.title)?.trim() ?? null;
  const body = blankToNull(input.body)?.trim() ?? null;
  return (
    content.title === title &&
    content.body === body &&
    content.photos.items.length === input.photoIds.length &&
    content.photos.items.every(
      (photo, i) => photo.photoId === input.photoIds[i],
    ) &&
    ShowcaseList.equals(content.showcases, input.showcases)
  );
}

const ref = (article: Pick<Article, "id">) => ownerOf(article.id);

function storedText<T extends string>(
  value: string | null,
  create: (input: string) => T,
): T | null {
  if (value === null) return null;
  const built = create(value);
  if (built !== value) throw new Error(`Text is not normalised: ${value}`);
  return built;
}

function storedDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid stored date");
  return value;
}

function showcaseFrom(stored: Readonly<{ kind: string; id: string }>) {
  if (!ShowcaseRef.isKind(stored.kind)) {
    throw new Error(`Unknown showcase kind: ${stored.kind}`);
  }
  const kind: ShowcaseKind = stored.kind;
  return ShowcaseRef.create(kind, stored.id);
}

function contentFrom(stored: ArticleSnapshot["content"]): ArticleContent {
  return {
    title: storedText(stored.title, ArticleTitle.create),
    body: storedText(stored.body, ArticleBody.create),
    photos: PhotoSet.reconstruct(
      stored.photoIds.map(
        (photoId): ArticlePhoto => ({ photoId: PhotoId.create(photoId) }),
      ),
      stored.photosTakenDown,
      SUBJECT,
    ),
    showcases: ShowcaseList.create(stored.showcases.map(showcaseFrom)),
  };
}

const isUnpublishReason = (value: string): value is UnpublishReason =>
  value === "byManager" || value === "photoTakedown";

/** Rebuilds a stored article through the value objects; `RehydrationError` on any invariant violation. */
function reconstruct(snapshot: ArticleSnapshot): Article {
  try {
    const base = {
      id: ArticleId.create(snapshot.id),
      version: Version.create(snapshot.version),
      updatedAt: storedDate(snapshot.updatedAt),
    };
    const content = contentFrom(snapshot.content);
    const { status, firstPublishedAt, reason } = snapshot.publication;
    if (status === "draft") {
      if (firstPublishedAt !== null || reason !== null) {
        throw new Error("A draft has no publication date or reason");
      }
      return { ...base, publication: Publication.draft(), content };
    }
    if (firstPublishedAt === null) {
      throw new Error(`A ${status} article needs its publication date`);
    }
    const published = storedDate(firstPublishedAt);
    if (status === "published" && reason === null) {
      return {
        ...base,
        publication: { status, firstPublishedAt: published },
        content: toPublishable(content),
      };
    }
    if (
      status === "unpublished" &&
      reason !== null &&
      isUnpublishReason(reason)
    ) {
      return {
        ...base,
        publication: { status, firstPublishedAt: published, reason },
        content,
      };
    }
    throw new Error(`Unknown publication ${status} / ${reason}`);
  } catch (error) {
    throw new RehydrationError("Stored article violates invariants", error);
  }
}

function snapshot(article: Article): ArticleSnapshot {
  const { publication, content } = article;
  return {
    id: article.id,
    publication: {
      status: publication.status,
      firstPublishedAt:
        publication.status === "draft" ? null : publication.firstPublishedAt,
      reason: publication.status === "unpublished" ? publication.reason : null,
    },
    content: {
      title: content.title,
      body: content.body,
      photoIds: PhotoSet.photoIds(content.photos),
      photosTakenDown: content.photos.takenDown,
      showcases: content.showcases.map((showcase) => ({
        kind: showcase.kind,
        id: showcase.id,
      })),
    },
    updatedAt: article.updatedAt,
    version: article.version,
  };
}

export const Article = {
  create,
  revise,
  publish,
  unpublish,
  takeDownPhotos,
  missingRequirements,
  isPublishable,
  searchableText,
  searchableTextOf,
  sameContent,
  isPublished,
  reconstruct,
  snapshot,
  ref,
};
