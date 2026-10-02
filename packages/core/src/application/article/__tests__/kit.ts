import { discoveryWorld } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { Article } from "@repo/core/domain/article/article";
import { ArticleId, type PhotoId } from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { listArticlesShowcasing } from "../../discovery/listArticlesShowcasing";
import { readArticle } from "../../discovery/readArticle";
import { placeKit } from "../../place/__tests__/kit";
import { type GeneratedId, UuidV7Generator } from "../../ports/idGenerator";
import type { ArticleContentFields, ShowcaseInput } from "../articles";
import { createArticle } from "../createArticle";
import { getArticleForEditing } from "../getArticleForEditing";
import { listArticlesForEditing } from "../listArticlesForEditing";
import { previewArticle } from "../previewArticle";
import { publishArticle } from "../publishArticle";
import { reviseArticle } from "../reviseArticle";
import { unpublishArticle } from "../unpublishArticle";

/** 2026-07-10 in Japan — the Discovery fixtures' `TODAY`. */
const KIT_NOW = "2026-07-10T03:00:00.000Z";

/** Content overrides naming showcases by their refs, as tests hold them. */
export type ContentSpec = Partial<
  Omit<ArticleContentFields, "showcases"> & {
    showcases: readonly ShowcaseRef[];
  }
>;

/** A showcase ref as the transport hands it over: its id parsed (`parseGeneratedId`). */
export function showcaseInput(ref: ShowcaseRef): ShowcaseInput {
  const id = UuidV7Generator.parse(ref.id);
  if (id === null) throw new Error(`Not a generated id: ${ref.id}`);
  return { kind: ref.kind, id };
}

/** A title and a body; no photo and no showcase unless given. */
export function content(overrides: ContentSpec = {}): ArticleContentFields {
  const { showcases = [], ...rest } = overrides;
  return {
    title: "路地裏の珈琲店をめぐる",
    body: "谷中の路地を歩いて、小さな珈琲店を訪ねた。",
    photoIds: [],
    ...rest,
    showcases: showcases.map(showcaseInput),
  };
}

export const EMPTY: ArticleContentFields = {
  title: "",
  body: "",
  photoIds: [],
  showcases: [],
};

export type ArticleKit = ReturnType<typeof articleKit>;

/**
 * Usecase-test kit for Article: Place's kit (people, roles, photos over
 * the production-shaped test container) on the Discovery fixtures' day,
 * the Discovery world over the same store for showcased targets, and the
 * seven usecases bound to the kit's container.
 */
export function articleKit() {
  const k = placeKit();
  const { container, t } = k;
  // The world mints its own ids from 1; keep the container's clear of them.
  t.idGenerator.reset(0x50_0000);
  k.clock.set(KIT_NOW);
  const world = discoveryWorld({
    uow: container.unitOfWorkProvider,
    savedEvents: t.storedEvents,
    detailQueries: container.detailQueries,
    referenceQueries: container.referenceQueries,
    explorationQueries: container.explorationQueries,
    keywordSearchQueries: container.keywordSearchQueries,
    feedCandidateQueries: container.feedCandidateQueries,
  });

  async function editor(label?: string): Promise<Person> {
    const who = await k.person(label);
    await k.editors(who);
    return who;
  }

  async function photos(who: Person, count: number): Promise<PhotoId[]> {
    const registered: PhotoId[] = [];
    for (let i = 0; i < count; i += 1) registered.push(await k.photo(who));
    return registered;
  }

  const newArticleId = (): GeneratedId => t.idGenerator.next();

  const create = (
    who: Person,
    body: ArticleContentFields = content(),
    articleId: GeneratedId = newArticleId(),
    over: RequestContainer = container,
  ) =>
    createArticle({
      container: over,
      actor: who.actor,
      input: { articleId, content: body },
    });

  const revise = (
    who: Person,
    article: Pick<Article, "id" | "version">,
    body: ArticleContentFields,
    over: RequestContainer = container,
  ) =>
    reviseArticle({
      container: over,
      actor: who.actor,
      input: { articleId: article.id, version: article.version, content: body },
    });

  const publish = (
    who: Person,
    articleId: ArticleId,
    over: RequestContainer = container,
  ) =>
    publishArticle({ container: over, actor: who.actor, input: { articleId } });

  const unpublish = (
    who: Person,
    articleId: ArticleId,
    over: RequestContainer = container,
  ) =>
    unpublishArticle({
      container: over,
      actor: who.actor,
      input: { articleId },
    });

  const list = (
    who: Person,
    status: Article["publication"]["status"] | null = null,
    pagination = { page: 1, limit: 100 },
  ) =>
    listArticlesForEditing({
      container,
      actor: who.actor,
      input: { status, pagination },
    });

  const get = (who: Person, articleId: ArticleId) =>
    getArticleForEditing({ container, actor: who.actor, input: { articleId } });

  const preview = (who: Person, articleId: ArticleId) =>
    previewArticle({ container, actor: who.actor, input: { articleId } });

  async function find(id: ArticleId): Promise<Versioned<Article> | null> {
    return container.unitOfWorkProvider.run(({ articleRepository }) =>
      articleRepository.findById(id),
    );
  }

  async function stored(id: ArticleId): Promise<Article> {
    const found = await find(id);
    if (found === null) throw new Error(`no article ${id}`);
    return found.entity;
  }

  /** Writes `change(article)` straight through the repository (no events). */
  async function write(
    id: ArticleId,
    change: (article: Article) => Article,
  ): Promise<Article> {
    return container.unitOfWorkProvider.run(async ({ articleRepository }) => {
      const read = await articleRepository.findById(id);
      if (read === null) throw new Error(`no article ${id}`);
      const next = change(read.entity);
      await articleRepository.save(next, read.expectedVersion);
      return next;
    });
  }

  /** `Article.takeDownPhotos` straight through the repository (no events). */
  const takeDown = (
    id: ArticleId,
    photoIds: readonly [PhotoId, ...PhotoId[]],
  ) => write(id, (a) => Article.takeDownPhotos(a, photoIds, k.tick()).entity);

  /**
   * An article created by `by` (a fresh editor by default) and brought to
   * `state` through the usecases. A published / unpublished one gets one
   * photo unless `body.photoIds` says otherwise.
   */
  async function article(
    body: ContentSpec = {},
    state: "draft" | "published" | "unpublished" = "draft",
    by?: Person,
  ): Promise<Article> {
    const who = by ?? (await editor("setup-editor"));
    const photoIds =
      body.photoIds ?? (state === "draft" ? [] : await photos(who, 1));
    const { article: created } = await create(
      who,
      content({ ...body, photoIds }),
    );
    if (state === "draft") return created;
    const published = await publish(who, created.id);
    if (state === "published") return published;
    return unpublish(who, created.id);
  }

  const absentArticleId = (): ArticleId => ArticleId.create(newArticleId());

  /** Discovery's article page (DT-05) as viewers read it. */
  const readPublic = (articleId: ArticleId) =>
    readArticle({ container, input: { articleId } });

  /** The ids of the published articles a target's detail traces (DT-01〜04). */
  const showcasing = async (target: ShowcaseRef) =>
    (
      await listArticlesShowcasing({
        container,
        input: { target, pagination: { page: 1, limit: 100 } },
      })
    ).items.map((summary) => summary.articleId);

  /** A viewable listing (of a viewable place), place, region and occasion, as refs. */
  async function viewableTargets() {
    const place = await world.place();
    const listing = await world.available(place.id);
    const region = await world.region();
    const occasion = await world.occasion();
    return {
      place,
      listing,
      region,
      occasion,
      refs: {
        listing: { kind: "listing", id: listing.id },
        place: { kind: "place", id: place.id },
        region: { kind: "region", id: region.id },
        occasion: { kind: "occasion", id: occasion.id },
      } as const satisfies Record<string, ShowcaseRef>,
    };
  }

  return {
    ...k,
    world,
    editor,
    photos,
    newArticleId,
    create,
    revise,
    publish,
    unpublish,
    list,
    get,
    preview,
    find,
    stored,
    write,
    takeDown,
    article,
    absentArticleId,
    viewableTargets,
    readPublic,
    showcasing,
  };
}
