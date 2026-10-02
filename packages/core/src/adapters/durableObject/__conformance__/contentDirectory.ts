import { Article } from "@repo/core/domain/article/article";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { Listing } from "@repo/core/domain/listing/listing";
import type {
  ContentDirectory,
  ContentSummary,
} from "@repo/core/domain/moderation/ports/contentDirectory";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import type { SqlExec, SqlRow } from "../sql";
import type { ContentLookup, ContentLookups } from "../store/contentLookups";
import {
  articleContent,
  articleIds,
  articleTicker,
  draftArticle,
  EMPTY_ARTICLE_CONTENT,
  insertArticles,
  publishedArticle,
  unpublishedArticle,
  updateArticle,
} from "./articleFixtures";
import { expectBusinessRuleError } from "./assertions";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness } from "./harness";
import {
  deleteListing,
  getListing,
  insertListings,
  listingFactory,
  saveListing,
} from "./listingFixtures";
import { insertOccasions } from "./occasionFixtures";
import {
  insertPlaces,
  newPlace,
  PLACE_T0,
  placeProfile,
  updatePlace,
} from "./placeFixtures";
import {
  emptyRegionContent,
  insertRegions,
  newRegion,
  publishedRegion,
  regionContent,
  regionIds,
  ticker,
  updateRegion,
} from "./regionFixtures";

/**
 * A fresh store and the directory over it. Listings, places, regions,
 * occasions and articles are stored through their own repositories; the
 * extra tests (without `#n`) exercise a row's rule on further states.
 */
export type ContentDirectoryHarness = ConformanceHarness &
  Readonly<{ directory: ContentDirectory }>;

const listingRef = (listing: Listing): ContentRef => ({
  kind: "listing",
  id: listing.id,
});

const placeRef = (place: Place): ContentRef => ({
  kind: "place",
  id: place.id,
});

const listingSummary = (listing: Listing): ContentSummary => ({
  target: listingRef(listing),
  name: listing.content.name,
  photoIds: PhotoSet.photoIds(listing.content.photos),
});

const placeSummary = (place: Place): ContentSummary => ({
  target: placeRef(place),
  name: place.profile.name,
  photoIds: PhotoSet.photoIds(place.profile.photos),
});

const regionRef = (region: Region): ContentRef => ({
  kind: "region",
  id: region.id,
});

const regionSummary = (region: Region): ContentSummary => ({
  target: regionRef(region),
  name: region.content.name,
  photoIds: PhotoSet.photoIds(region.content.photos),
});

const occasionRef = (occasion: Occasion): ContentRef => ({
  kind: "occasion",
  id: occasion.id,
});

const occasionSummary = (occasion: Occasion): ContentSummary => ({
  target: occasionRef(occasion),
  name: occasion.content.name,
  photoIds: PhotoSet.photoIds(occasion.content.photos),
});

const articleRef = (article: Article): ContentRef => Article.ref(article);

const articleSummary = (article: Article): ContentSummary => ({
  target: articleRef(article),
  name: article.content.title,
  photoIds: PhotoSet.photoIds(article.content.photos),
});

/** Places and listings built through their domains, ids ascending in mint order. */
function world(h: ContentDirectoryHarness) {
  const f = listingFactory();
  const place = async (photos = 0, name = "山田珈琲店"): Promise<Place> => {
    const built = newPlace(f.place(), {
      name,
      photoIds: Array.from({ length: photos }, () => f.photo().photoId),
    });
    await insertPlaces(h, built);
    return built;
  };
  const store = async <L extends Listing>(listing: L): Promise<L> => {
    await insertListings(h, listing);
    return listing;
  };
  return { f, place, store };
}

/** `spec/testcases/ports/contentDirectory.md`. */
export function describeContentDirectoryContract(
  makeHarness: () => Promise<ContentDirectoryHarness>,
): void {
  describe("ContentDirectory contract", () => {
    describe("describe", () => {
      it("contentDirectory#1 公開中の掲載 L1、店舗 P1、公開中の地域 R1、公開中のイベント O1、公開中の読みもの A1 が保存されている / describe([A1, O1, R1, P1, L1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1, "一号店");
        const L1 = await w.store(
          w.f.published(P1.id, { name: "限定メニュー" }),
        );
        const ids = regionIds();
        const R1 = publishedRegion(ids.region(), [ids.photo(), ids.photo()]);
        await insertRegions(h, R1);
        const O1 = occasionFactory().published({ name: "夏祭り", photos: 2 });
        await insertOccasions(h, O1);
        const a = articleIds();
        const A1 = publishedArticle(
          a.article(),
          articleContent({
            title: "路地の話",
            photoIds: [a.photo(), a.photo()],
          }),
        );
        await insertArticles(h, A1);
        const found = await h.directory.describe([
          articleRef(A1),
          occasionRef(O1),
          regionRef(R1),
          placeRef(P1),
          listingRef(L1),
        ]);
        expect(found).toEqual([
          listingSummary(L1),
          placeSummary(P1),
          regionSummary(R1),
          occasionSummary(O1),
          articleSummary(A1),
        ]);
        expect(found.map((summary) => summary.target.kind)).toEqual([
          "listing",
          "place",
          "region",
          "occasion",
          "article",
        ]);
        expect(found[4]?.name).toBe("路地の話");
      });

      it("contentDirectory#2 店舗 P2、P1 が保存されている / describe([P2, P1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(0, "一号店");
        const P2 = await w.place(0, "二号店");
        expect(
          await h.directory.describe([placeRef(P2), placeRef(P1)]),
        ).toEqual([placeSummary(P1), placeSummary(P2)]);
      });

      it("contentDirectory#3 写真 X・Y・Z をこの順に持つ掲載 L1 が保存されている / describe([L1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const [X, Y, Z] = [w.f.photo(), w.f.photo(), w.f.photo()];
        const L1 = await w.store(
          w.f.published(w.f.place(), { photos: [X, Y, Z] }),
        );
        const [summary] = await h.directory.describe([listingRef(L1)]);
        expect(summary?.photoIds).toEqual([X.photoId, Y.photoId, Z.photoId]);
      });

      it("contentDirectory#4 写真を持たない店舗 P1 が保存されている / describe([P1])", async () => {
        const h = await makeHarness();
        const P1 = await world(h).place(0, "一号店");
        expect(await h.directory.describe([placeRef(P1)])).toEqual([
          { target: placeRef(P1), name: "一号店", photoIds: [] },
        ]);
      });

      it("contentDirectory#5 店舗 P1 が保存されている。P2 は保存されていない / describe([P1, P2])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1, "一号店");
        const P2 = { kind: "place", id: w.f.place() } as const;
        expect(await h.directory.describe([placeRef(P1), P2])).toEqual([
          placeSummary(P1),
        ]);
      });

      it("contentDirectory#6 掲載 L1 が保存されている / UnitOfWork の中で L1 を delete してコミットし、直後に describe([L1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const L1 = await w.store(w.f.published(w.f.place()));
        const read = await getListing(h, L1.id);
        await deleteListing(h, L1.id, read.expectedVersion);
        expect(await h.directory.describe([listingRef(L1)])).toEqual([]);
      });

      it("contentDirectory#7 店舗 P1 が保存されている / kind が listing で、id の文字列が P1 と同じ ContentRef で describe", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1);
        expect(
          await h.directory.describe([
            { kind: "listing", id: ListingId.create(P1.id) },
          ]),
        ).toEqual([]);
      });

      it("contentDirectory#8 運営による非公開の掲載 L1、非公開の店舗 P1、公開を取り下げた地域 R1、運営による非公開のイベント O1、公開を取り下げた読みもの A1 が保存されている / describe([L1, P1, R1, O1, A1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1, "非公開の店舗");
        await updatePlace(h, P1.id, (p) => Place.suspend(p, PLACE_T0).entity);
        const L1 = await w.store(
          w.f.suspended(w.f.published(P1.id, { name: "運営による非公開" })),
        );
        const ids = regionIds();
        const R1 = Region.unpublish(
          publishedRegion(ids.region(), [ids.photo()], {
            name: "取り下げた地域",
          }),
          ticker()(),
        ).entity;
        await insertRegions(h, R1);
        const o = occasionFactory();
        const O1 = o.suspended(o.published({ name: "非公開のイベント" }));
        await insertOccasions(h, O1);
        const a = articleIds();
        const A1 = unpublishedArticle(
          a.article(),
          articleContent({
            title: "取り下げた読みもの",
            photoIds: [a.photo()],
          }),
        );
        await insertArticles(h, A1);
        expect(
          await h.directory.describe([
            listingRef(L1),
            placeRef(P1),
            regionRef(R1),
            occasionRef(O1),
            articleRef(A1),
          ]),
        ).toEqual([
          listingSummary(L1),
          placeSummary(P1),
          regionSummary(R1),
          occasionSummary(O1),
          articleSummary(A1),
        ]);
      });

      it("returns suspended, unpublished and draft listings and a suspended place (#8 on stage-2 kinds)", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1, "非公開の店舗");
        await updatePlace(h, P1.id, (p) => Place.suspend(p, PLACE_T0).entity);
        const suspended = await w.store(
          w.f.suspended(w.f.published(P1.id, { name: "運営による非公開" })),
        );
        const unpublished = await w.store(
          w.f.unpublished(P1.id, { name: "一時非公開" }),
        );
        const draft = await w.store(w.f.draft(P1.id, { name: "下書き" }));
        expect(
          await h.directory.describe([
            placeRef(P1),
            listingRef(draft),
            listingRef(unpublished),
            listingRef(suspended),
          ]),
        ).toEqual([
          listingSummary(suspended),
          listingSummary(unpublished),
          listingSummary(draft),
          placeSummary(P1),
        ]);
      });

      it("returns an unpublished region and a suspended region with name and photos (#8 with regions)", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const tick = ticker();
        const unpublished = Region.unpublish(
          publishedRegion(ids.region(), [ids.photo()], {
            name: "取り下げた地域",
          }),
          tick(),
        ).entity;
        const suspended = Region.suspend(
          publishedRegion(ids.region(), [ids.photo()], {
            name: "非公開の地域",
          }),
          tick(),
        ).entity;
        await insertRegions(h, unpublished, suspended);
        expect(
          await h.directory.describe([
            regionRef(suspended),
            regionRef(unpublished),
          ]),
        ).toEqual([regionSummary(unpublished), regionSummary(suspended)]);
      });

      it("returns a suspended, an unpublished, a cancelled and a draft occasion with name and photos (#8 with occasions)", async () => {
        const h = await makeHarness();
        const o = occasionFactory();
        const suspended = o.suspended(
          o.published({ name: "非公開のイベント" }),
        );
        const unpublished = o.unpublished({ name: "取り下げたイベント" });
        const cancelled = o.cancelled(o.published({ name: "中止のイベント" }));
        const unnamed = o.bareDraft({ photos: 1 });
        const all = [suspended, unpublished, cancelled, unnamed];
        await insertOccasions(h, ...all);
        expect(
          await h.directory.describe([...all].reverse().map(occasionRef)),
        ).toEqual(all.map(occasionSummary));
        expect(
          (await h.directory.describe([occasionRef(unnamed)]))[0]?.name,
        ).toBeNull();
      });

      it("shows an occasion's photos after a committed takedown (#14 on an occasion)", async () => {
        const h = await makeHarness();
        const o = occasionFactory();
        const [X, Y] = [o.photo(), o.photo()];
        const O1 = o.published({ photos: [X, Y] });
        await insertOccasions(h, O1);
        await h.uow.run(async ({ occasionRepository }) => {
          const read = await occasionRepository.findById(O1.id);
          if (read === null) throw new Error("no occasion");
          await occasionRepository.save(
            Occasion.takeDownPhotos(read.entity, [X], o.tick()).entity,
            read.expectedVersion,
          );
        });
        const [summary] = await h.directory.describe([occasionRef(O1)]);
        expect(summary?.photoIds).toEqual([Y]);
      });

      it("contentDirectory#9 非公開の店舗 P1 に紐づく公開中の掲載 L1 が保存されている / describe([L1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place(1);
        await updatePlace(h, P1.id, (p) => Place.suspend(p, PLACE_T0).entity);
        const L1 = await w.store(
          w.f.published(P1.id, { name: "限定メニュー" }),
        );
        expect(await h.directory.describe([listingRef(L1)])).toEqual([
          listingSummary(L1),
        ]);
      });

      it("contentDirectory#10 名称が未入力の下書きの地域 R1 と、タイトルが未入力の下書きの読みもの A1 が保存されている / describe([R1, A1])", async () => {
        const h = await makeHarness();
        const R1 = newRegion(regionIds().region(), emptyRegionContent());
        await insertRegions(h, R1);
        const A1 = draftArticle(articleIds().article(), EMPTY_ARTICLE_CONTENT);
        await insertArticles(h, A1);
        expect(
          await h.directory.describe([articleRef(A1), regionRef(R1)]),
        ).toEqual([
          { target: regionRef(R1), name: null, photoIds: [] },
          { target: articleRef(A1), name: null, photoIds: [] },
        ]);
      });

      it("returns an unnamed draft listing with name null (#10 on stage-2 kinds)", async () => {
        const h = await makeHarness();
        const w = world(h);
        const L1 = await w.store(w.f.draft(w.f.place(), { name: null }));
        expect(await h.directory.describe([listingRef(L1)])).toEqual([
          {
            target: listingRef(L1),
            name: null,
            photoIds: listingSummary(L1).photoIds,
          },
        ]);
      });

      it("contentDirectory#11 店舗 P1 が保存されている / describe([])", async () => {
        const h = await makeHarness();
        await world(h).place();
        expect(await h.directory.describe([])).toEqual([]);
      });

      it("contentDirectory#12 100件の店舗が保存されている / 100件の対象で describe", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const places = Array.from({ length: 100 }, (_, i) =>
          newPlace(f.place(), { name: `店舗${i + 1}` }),
        );
        await insertPlaces(h, ...places);
        const found = await h.directory.describe(places.map(placeRef));
        expect(found).toHaveLength(100);
        expect(found).toEqual(places.map(placeSummary));
      });

      it("contentDirectory#13 店舗 P1 が保存されている / 101件の対象で describe", async () => {
        const h = await makeHarness();
        const w = world(h);
        const P1 = await w.place();
        await expectBusinessRuleError(
          h.directory.describe([
            placeRef(P1),
            ...Array.from({ length: 100 }, () => ({
              kind: "place" as const,
              id: w.f.place(),
            })),
          ]),
          CommonErrorCode.InvalidInput,
        );
      });
    });

    describe("可視性", () => {
      it("contentDirectory#14 写真 X・Y を持つ掲載 L1 が保存されている / UnitOfWork の中で、X を外した L1 を save してコミットし、直後に describe([L1])", async () => {
        const h = await makeHarness();
        const w = world(h);
        const [X, Y] = [w.f.photo(), w.f.photo()];
        const L1 = await w.store(
          w.f.published(w.f.place(), { photos: [X, Y] }),
        );
        const read = await getListing(h, L1.id);
        await saveListing(
          h,
          Listing.takeDownPhotos(read.entity, [X.photoId], w.f.tick()).entity,
          read.expectedVersion,
        );
        const [summary] = await h.directory.describe([listingRef(L1)]);
        expect(summary?.photoIds).toEqual([Y.photoId]);
      });

      it("contentDirectory#15 写真 X を持つ地域 R1 が保存されている / UnitOfWork の中で、写真 Y を加えた R1 を save してコミットし、直後に describe([R1])", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, Y] = [ids.photo(), ids.photo()];
        const R1 = publishedRegion(ids.region(), [X]);
        await insertRegions(h, R1);
        await updateRegion(
          h,
          R1.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({ photoIds: [X, Y] }),
              ticker()(),
            ).entity,
        );
        expect(await h.directory.describe([regionRef(R1)])).toEqual([
          { target: regionRef(R1), name: "谷中", photoIds: [X, Y] },
        ]);
      });

      it("shows a photo added by a committed save (#15 on a listing)", async () => {
        const h = await makeHarness();
        const w = world(h);
        const [X, Y] = [w.f.photo(), w.f.photo()];
        const L1 = await w.store(w.f.published(w.f.place(), { photos: [X] }));
        const read = await getListing(h, L1.id);
        const content = {
          ...read.entity.content,
          photos: PhotoSet.of([X, Y], "LISTING"),
        };
        await saveListing(
          h,
          Listing.update(
            read.entity,
            content,
            w.f.catalogOf(
              content.categoryId === null ? [] : [content.categoryId],
            ),
            w.f.tick(),
          ).entity,
          read.expectedVersion,
        );
        const [summary] = await h.directory.describe([listingRef(L1)]);
        expect(summary?.photoIds).toEqual([X.photoId, Y.photoId]);
      });

      it("contentDirectory#16 読みもの A1 が保存されている / UnitOfWork の中で A1 のタイトルを変えて save してコミットし、直後に describe([A1])", async () => {
        const h = await makeHarness();
        const a = articleIds();
        const photo = a.photo();
        const A1 = publishedArticle(
          a.article(),
          articleContent({ title: "旧タイトル", photoIds: [photo] }),
        );
        await insertArticles(h, A1);
        await updateArticle(
          h,
          A1.id,
          (article) =>
            Article.revise(
              article,
              articleContent({ title: "新タイトル", photoIds: [photo] }),
              articleTicker()(),
            ).entity,
        );
        expect(await h.directory.describe([articleRef(A1)])).toEqual([
          { target: articleRef(A1), name: "新タイトル", photoIds: [photo] },
        ]);
      });

      it("shows a name changed by a committed save (#16 on a place)", async () => {
        const h = await makeHarness();
        const P1 = await world(h).place(0, "旧店名");
        await updatePlace(
          h,
          P1.id,
          (p) =>
            Place.updateProfile(p, placeProfile({ name: "新店名" }), PLACE_T0)
              .entity,
        );
        const [summary] = await h.directory.describe([placeRef(P1)]);
        expect(summary?.name).toBe("新店名");
      });

      it("contentDirectory#17 空 / UnitOfWork の中で店舗 P1 を insert し、fn が例外を投げた後、describe([P1])", async () => {
        const h = await makeHarness();
        const P1 = newPlace(listingFactory().place());
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(P1);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await h.directory.describe([placeRef(P1)])).toEqual([]);
      });
    });
  });
}

/**
 * The directory's per-kind lookup mechanism (`describeContent`) over a
 * conformance-only table, so the five-kind order and a kind without
 * storage (articles, until they land) are exercised.
 */
export type ContentLookupHarness = Readonly<{
  directory: ContentDirectory;
  seed(targets: readonly ContentSummary[]): Promise<void>;
}>;

const TABLE = "conformance_content";

export function seedConformanceContent(
  sql: SqlExec,
  targets: readonly ContentSummary[],
): void {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      photo_ids TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    )`,
  );
  for (const { target, name, photoIds } of targets) {
    sql.exec(
      `INSERT INTO ${TABLE} (kind, id, name, photo_ids) VALUES (?, ?, ?, ?)`,
      target.kind,
      target.id,
      name,
      JSON.stringify(photoIds),
    );
  }
}

type Row = Readonly<{
  id: string;
  name: string | null;
  photo_ids: string;
}> &
  SqlRow;

const lookupOf =
  (kind: ContentRef["kind"]): ContentLookup =>
  (sql, ids) => {
    const exists = sql
      .exec<{ n: number } & SqlRow>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?",
        TABLE,
      )
      .toArray()[0];
    if (Number(exists?.n ?? 0) === 0) return [];
    return sql
      .exec<Row>(
        `SELECT id, name, photo_ids FROM ${TABLE}
           WHERE kind = ? AND id IN (SELECT value FROM json_each(?))`,
        kind,
        JSON.stringify(ids),
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        photoIds: JSON.parse(row.photo_ids) as string[],
      }));
  };

/** Lookups over the conformance-only table, one per kind. */
export const CONFORMANCE_CONTENT_LOOKUPS: ContentLookups = {
  listing: lookupOf("listing"),
  place: lookupOf("place"),
  region: lookupOf("region"),
  occasion: lookupOf("occasion"),
  article: lookupOf("article"),
};

/** The five-kind mechanism behind `ContentDirectory` (conformance-only lookups). */
export function describeContentLookupMechanism(
  makeHarness: () => Promise<ContentLookupHarness>,
): void {
  const ids = () => notificationIds(0x60_0000);

  describe("ContentDirectory lookup mechanism", () => {
    it("asks one lookup per kind and returns listing, place, region, occasion, article, then id", async () => {
      const h = await makeHarness();
      const id = ids();
      const photo = PhotoId.create(id.raw());
      const [L1, P1, P2, R1, O1, A1] = [
        { kind: "listing", id: id.listing() },
        { kind: "place", id: id.place() },
        { kind: "place", id: id.place() },
        { kind: "region", id: id.region() },
        { kind: "occasion", id: id.occasion() },
        { kind: "article", id: id.article() },
      ] as const;
      const summary = (
        target: ContentRef,
        name: string | null,
      ): ContentSummary => ({ target, name, photoIds: [photo] });
      await h.seed([
        summary(A1, null),
        summary(O1, "祭り"),
        summary(R1, null),
        summary(P2, "二号店"),
        summary(P1, "一号店"),
        summary(L1, "掲載"),
      ]);
      expect(await h.directory.describe([A1, O1, R1, P2, P1, L1, P2])).toEqual([
        summary(L1, "掲載"),
        summary(P1, "一号店"),
        summary(P2, "二号店"),
        summary(R1, null),
        summary(O1, "祭り"),
        summary(A1, null),
      ]);
    });
  });
}
