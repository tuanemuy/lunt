import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import {
  Article,
  type ArticleContentInput,
  type ArticleStatus,
  type DraftArticle,
  type PublishedArticle,
  type UnpublishedArticle,
} from "@repo/core/domain/article/article";
import {
  ArticleId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { ConformanceHarness } from "./harness";

export const ARTICLE_T0 = new Date("2026-09-01T00:00:00.000Z");

/** Article, showcase-target and photo ids for one test, ascending in mint order. */
export function articleIds() {
  const ids = new FakeIdGenerator(0x90_0000);
  return {
    article: (): ArticleId => ArticleId.create(ids.next()),
    photo: (): PhotoId => PhotoId.create(ids.next()),
    listing: (): ShowcaseRef => ({
      kind: "listing",
      id: ListingId.create(ids.next()),
    }),
    place: (): ShowcaseRef => ({
      kind: "place",
      id: PlaceId.create(ids.next()),
    }),
    region: (): ShowcaseRef => ({
      kind: "region",
      id: RegionId.create(ids.next()),
    }),
    occasion: (): ShowcaseRef => ({
      kind: "occasion",
      id: OccasionId.create(ids.next()),
    }),
  };
}

/** A clock for fixtures: every call is one minute after the previous. */
export function articleTicker(start: Date = ARTICLE_T0) {
  let at = start.getTime();
  return (): Date => {
    at += 60_000;
    return new Date(at);
  };
}

/** Content with a title and a body, no photo and no showcase unless given. */
export function articleContent(
  overrides: Partial<ArticleContentInput> = {},
): ArticleContentInput {
  return {
    title: "路地裏の珈琲店をめぐる",
    body: "谷中の路地を歩いて、小さな珈琲店を訪ねた。",
    photoIds: [],
    showcases: [],
    ...overrides,
  };
}

/** Content with nothing entered. */
export const EMPTY_ARTICLE_CONTENT: ArticleContentInput = {
  title: "",
  body: "",
  photoIds: [],
  showcases: [],
};

export function draftArticle(
  id: ArticleId,
  content: ArticleContentInput = articleContent(),
  now: Date = ARTICLE_T0,
): DraftArticle {
  return Article.create({ id, content }, now).entity;
}

/** A draft published at `now`: the content must carry at least one photo. */
export function publishedArticle(
  id: ArticleId,
  content: ArticleContentInput,
  now: Date = ARTICLE_T0,
): PublishedArticle {
  return Article.publish(draftArticle(id, content, now), now);
}

/** A published article unpublished by an editor at `now`. */
export function unpublishedArticle(
  id: ArticleId,
  content: ArticleContentInput,
  now: Date = ARTICLE_T0,
): UnpublishedArticle {
  return Article.unpublish(publishedArticle(id, content, now), now);
}

export async function insertArticles(
  h: Pick<ConformanceHarness, "uow">,
  ...articles: readonly Article[]
): Promise<void> {
  await h.uow.run(async ({ articleRepository }) => {
    for (const article of articles) await articleRepository.insert(article);
  });
}

export function findArticle(
  h: Pick<ConformanceHarness, "uow">,
  id: ArticleId,
): Promise<Versioned<Article> | null> {
  return h.uow.run(({ articleRepository }) => articleRepository.findById(id));
}

export async function getArticle(
  h: Pick<ConformanceHarness, "uow">,
  id: ArticleId,
): Promise<Versioned<Article>> {
  const found = await findArticle(h, id);
  if (found === null) throw new NotFoundError("TEST", `no article ${id}`);
  return found;
}

export function saveArticle(
  h: Pick<ConformanceHarness, "uow">,
  article: Article,
  expectedVersion: ExpectedVersion<Article>,
): Promise<void> {
  return h.uow.run(({ articleRepository }) =>
    articleRepository.save(article, expectedVersion),
  );
}

/** Reads the article, applies `change` and saves it in one unit of work. */
export async function updateArticle(
  h: Pick<ConformanceHarness, "uow">,
  id: ArticleId,
  change: (article: Article) => Article,
): Promise<Article> {
  return h.uow.run(async ({ articleRepository }) => {
    const read = await articleRepository.findById(id);
    if (read === null) throw new NotFoundError("TEST", `no article ${id}`);
    const next = change(read.entity);
    await articleRepository.save(next, read.expectedVersion);
    return next;
  });
}

export function articlePage(
  h: Pick<ConformanceHarness, "uow">,
  status: ArticleStatus | null,
  pagination: Pagination = { page: 1, limit: 100 },
) {
  return h.uow.run(({ articleRepository }) =>
    articleRepository.findPage({ status }, pagination),
  );
}

export function articlesShowcasing(
  h: Pick<ConformanceHarness, "uow">,
  refs: readonly ShowcaseRef[],
  pagination: Pagination = { page: 1, limit: 100 },
) {
  return h.uow.run(({ articleRepository }) =>
    articleRepository.findPublishedByShowcases(refs, pagination),
  );
}
