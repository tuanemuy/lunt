import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { CategoryId, ListingId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { Listing, type ListingShelf } from "@repo/core/domain/listing/listing";
import { Offering } from "@repo/core/domain/listing/offering";
import { ListingName } from "@repo/core/domain/listing/values";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  ALL,
  day,
  deleteListing,
  findListing,
  getListing,
  idsOf,
  insertListings,
  keyword,
  listingFactory,
  openDates,
  page,
  period,
  saveListing,
  TODAY,
} from "./listingFixtures";

type H = ConformanceHarness;

const byPlace = (
  h: H,
  placeId: Listing["placeId"],
  shelf: ListingShelf,
  today: LocalDate = TODAY,
  pagination: Pagination = page(1),
) =>
  h.uow.run(({ listingRepository }) =>
    listingRepository.findPageByPlace(placeId, shelf, today, pagination),
  );

const counts = (h: H, placeId: Listing["placeId"], today: LocalDate = TODAY) =>
  h.uow.run(({ listingRepository }) =>
    listingRepository.countByPlace(placeId, today),
  );

const attachable = (
  h: H,
  placeId: Listing["placeId"],
  pagination: Pagination = page(1),
) =>
  h.uow.run(({ listingRepository }) =>
    listingRepository.findPageAttachable(placeId, TODAY, pagination),
  );

const byCategories = (
  h: H,
  categoryIds: readonly CategoryId[],
  pagination: Pagination = page(1),
) =>
  h.uow.run(({ listingRepository }) =>
    listingRepository.findPageByCategories(categoryIds, pagination),
  );

const search = (h: H, kw: SearchKeyword, pagination: Pagination = page(1)) =>
  h.uow.run(({ listingRepository }) =>
    listingRepository.searchForOperation(kw, pagination),
  );

const findByIds = (h: H, ids: readonly ListingId[]) =>
  h.uow.run(({ listingRepository }) => listingRepository.findByIds(ids));

const sorted = (ids: readonly ListingId[]): readonly ListingId[] =>
  [...ids].sort();

const renamed = (
  f: ReturnType<typeof listingFactory>,
  listing: Listing,
  name: string,
  at: Date,
): Listing =>
  Listing.update(
    listing,
    { ...listing.content, name: ListingName.create(name) },
    f.catalogOf(
      listing.content.categoryId === null ? [] : [listing.content.categoryId],
    ),
    at,
  ).entity;

/** `spec/testcases/ports/listingRepository.md`. */
export function describeListingRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("ListingRepository contract", () => {
    describe("insert / findById / save / delete", () => {
      it("listingRepository#1 掲載がない / 下書きを insert し、同じ ID で findById する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), {
          description: "説明\n2行目",
          photos: [
            f.photo({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 }),
            f.photo(),
          ],
          offering: period("2026-07-01", "2026-08-31"),
        });
        await insertListings(h, listing);
        const found = await getListing(h, listing.id);
        expect(found.entity).toEqual(listing);
        expect(typeof found.expectedVersion).toBe("number");
      });

      it('listingRepository#2 掲載がない / 公開中の掲載（manualEnd が { ended: true }）と、一時非公開の掲載（reason: "photoTakedown"）と、運営による非公開の掲載を insert し、それぞれ findById する', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const ended = f.manuallyEnded(p);
        const live = f.published(p, { photos: 2 });
        const takenDown = Listing.takeDownPhotos(
          live,
          [
            live.content.photos.items[0]?.photoId ?? f.photo().photoId,
            live.content.photos.items[1]?.photoId ?? f.photo().photoId,
          ],
          f.tick(),
        ).entity;
        const suspended = f.suspended(f.published(p));
        await insertListings(h, ended, takenDown, suspended);
        for (const listing of [ended, takenDown, suspended]) {
          expect((await getListing(h, listing.id)).entity).toEqual(listing);
        }
        const reread = (await getListing(h, takenDown.id)).entity;
        expect(reread.publication).toEqual({
          status: "unpublished",
          firstPublishedAt: live.publication.firstPublishedAt,
          reason: "photoTakedown",
        });
        expect(
          Listing.manualEndOf((await getListing(h, ended.id)).entity),
        ).toEqual({ ended: true });
        expect((await getListing(h, suspended.id)).entity.suspension).toEqual({
          suspended: true,
        });
      });

      it("listingRepository#3 掲載を insert し、findById で expectedVersion を得ている / takeDownPhotos で写真を外した掲載を、その expectedVersion で save し、findById する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.published(f.place(), { photos: 3 });
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        const first = listing.content.photos.items[0];
        if (first === undefined) throw new Error("photo");
        const next = Listing.takeDownPhotos(
          read.entity,
          [first.photoId],
          f.tick(),
        ).entity;
        await saveListing(h, next, read.expectedVersion);
        const after = (await getListing(h, listing.id)).entity;
        expect(after).toEqual(next);
        expect(after.content.photos.items).toEqual(
          listing.content.photos.items.slice(1),
        );
        expect(after.content.photos.takenDown).toBe(true);
      });

      it("listingRepository#4 掲載がない / 名称・説明・カテゴリーが null で、写真のない下書きを insert し、findById する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), {
          name: null,
          description: null,
          categoryId: null,
          photos: 0,
        });
        await insertListings(h, listing);
        const found = (await getListing(h, listing.id)).entity;
        expect(found).toEqual(listing);
        expect(found.content.name).toBeNull();
        expect(found.content.description).toBeNull();
        expect(found.content.categoryId).toBeNull();
        expect(found.content.photos.items).toEqual([]);
      });

      it("listingRepository#5 掲載がない / 提供の設定が「設定しない」、開始日だけの提供期間、終了日だけの提供期間、複数の開催日の掲載を insert し、それぞれ findById する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = [
          f.draft(p, { offering: Offering.none() }),
          f.draft(p, { offering: period("2026-07-20", null) }),
          f.draft(p, { offering: period(null, "2026-08-31") }),
          f.draft(p, {
            offering: openDates("2026-08-03", "2026-07-20", "2026-07-27"),
          }),
        ];
        await insertListings(h, ...listings);
        for (const listing of listings) {
          expect(
            (await getListing(h, listing.id)).entity.content.offering,
          ).toEqual(listing.content.offering);
        }
      });

      it("listingRepository#6 ID が X の掲載を insert している / 同じ ID X の別の掲載を insert する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.draft(f.place(), { name: "元" });
        await insertListings(h, x);
        const other = f.draft(f.place(), { name: "別" }, f.tick(), x.id);
        await expect(insertListings(h, other)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await getListing(h, x.id)).entity).toEqual(x);
      });

      it("listingRepository#7 掲載がない / 存在しない ID で findById する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        expect(await findListing(h, f.listingId())).toBeNull();
      });

      it("listingRepository#8 掲載を insert し、findById で expectedVersion を得ている / 内容を変えた掲載を、その expectedVersion で save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        const next = renamed(f, read.entity, "新しい名称", f.tick());
        await saveListing(h, next, read.expectedVersion);
        const after = await getListing(h, listing.id);
        expect(after.entity).toEqual(next);
        expect(after.expectedVersion).not.toBe(read.expectedVersion);
      });

      it("listingRepository#9 上の save が成立している / 新しい expectedVersion で、もう一度 save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        await saveListing(
          h,
          renamed(f, read.entity, "一度目", f.tick()),
          read.expectedVersion,
        );
        const again = await getListing(h, listing.id);
        const second = renamed(f, again.entity, "二度目", f.tick());
        await saveListing(h, second, again.expectedVersion);
        expect((await getListing(h, listing.id)).entity).toEqual(second);
      });

      it("listingRepository#10 掲載を insert し、findById で expectedVersion を得た後、別の save が成立している / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        const winner = renamed(f, read.entity, "先", f.tick());
        await saveListing(h, winner, read.expectedVersion);
        await expect(
          saveListing(
            h,
            renamed(f, read.entity, "後", f.tick()),
            read.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getListing(h, listing.id)).entity).toEqual(winner);
      });

      it("listingRepository#11 掲載を insert し、同じ expectedVersion を2つの呼び出し側が持っている / 2つの save を同時に行う", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        const a = renamed(f, read.entity, "A", f.tick());
        const b = renamed(f, read.entity, "B", f.tick());
        const results = await Promise.allSettled([
          saveListing(h, a, read.expectedVersion),
          saveListing(h, b, read.expectedVersion),
        ]);
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
        const winner = results[0]?.status === "fulfilled" ? a : b;
        expect((await getListing(h, listing.id)).entity).toEqual(winner);
      });

      it("listingRepository#12 掲載がない / 存在しない ID の掲載を save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await expect(
          saveListing(h, f.draft(f.place()), 0 as ExpectedVersion<Listing>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("listingRepository#13 掲載を insert し、findById で expectedVersion を得ている / その expectedVersion で delete する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        await deleteListing(h, listing.id, read.expectedVersion);
        expect(await findListing(h, listing.id)).toBeNull();
      });

      it("listingRepository#14 掲載を insert し、findById で expectedVersion を得た後、別の save が成立している / 古い expectedVersion で delete する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        await saveListing(
          h,
          renamed(f, read.entity, "先", f.tick()),
          read.expectedVersion,
        );
        await expect(
          deleteListing(h, listing.id, read.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findListing(h, listing.id)).not.toBeNull();
      });

      it("listingRepository#15 掲載がない / 存在しない ID で delete する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await expect(
          deleteListing(h, f.listingId(), 0 as ExpectedVersion<Listing>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("listingRepository#16 掲載を delete している / 同じ ID の掲載を save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const read = await getListing(h, listing.id);
        await deleteListing(h, listing.id, read.expectedVersion);
        await expect(
          saveListing(
            h,
            renamed(f, read.entity, "後", f.tick()),
            read.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("listingRepository#17 掲載 X を insert し、delete している / X と同じ ID の下書きを insert する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.draft(f.place());
        await insertListings(h, x);
        await deleteListing(
          h,
          x.id,
          (await getListing(h, x.id)).expectedVersion,
        );
        await expect(
          insertListings(h, f.draft(f.place(), {}, f.tick(), x.id)),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findListing(h, x.id)).toBeNull();
      });

      it("listingRepository#18 店舗 A の掲載を insert し、delete している / findByIds、findPageByPlace、countByPlace、findPageAttachable、findPageByCategories、searchForOperation で、その掲載に当たる条件を問い合わせる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listing = f.published(a, { name: "りんご" });
        await insertListings(h, listing);
        await deleteListing(
          h,
          listing.id,
          (await getListing(h, listing.id)).expectedVersion,
        );
        expect(await findByIds(h, [listing.id])).toEqual([]);
        expect(await byPlace(h, a, ALL)).toEqual({ items: [], count: 0 });
        expect(await counts(h, a)).toEqual({
          publication: { published: 0, draft: 0, hidden: 0 },
          phase: { upcoming: 0, available: 0, ended: 0 },
        });
        expect(await attachable(h, a)).toEqual({ items: [], count: 0 });
        expect(await byCategories(h, [f.defaultCategory])).toEqual({
          items: [],
          count: 0,
        });
        expect(await search(h, keyword("りんご"))).toEqual({
          items: [],
          count: 0,
        });
      });
    });

    describe("findByIds", () => {
      it("listingRepository#19 掲載 X、Y、Z を insert している / X と Z の ID で findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const [x, y, z] = [f.draft(p), f.draft(p), f.draft(p)];
        await insertListings(h, x, y, z);
        const found = await findByIds(h, [x.id, z.id]);
        expect(sorted(idsOf(found))).toEqual(sorted([x.id, z.id]));
      });

      it("listingRepository#20 掲載 X を insert している / X の ID と、存在しない ID で findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.draft(f.place());
        await insertListings(h, x);
        expect(await findByIds(h, [x.id, f.listingId()])).toEqual([x]);
      });

      it("listingRepository#21 掲載を insert している / 空の ID の並びで findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await insertListings(h, f.draft(f.place()));
        expect(await findByIds(h, [])).toEqual([]);
      });

      it("listingRepository#22 下書き、一時非公開、運営による非公開の掲載を insert している / それらの ID で findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = [
          f.draft(p),
          f.unpublished(p),
          f.suspended(f.published(p)),
        ];
        await insertListings(h, ...listings);
        const found = await findByIds(h, idsOf(listings));
        expect(sorted(idsOf(found))).toEqual(sorted(idsOf(listings)));
      });

      it("listingRepository#23 掲載を100件 insert している / 100件の ID で findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = Array.from({ length: 100 }, () => f.draft(p));
        await insertListings(h, ...listings);
        const found = await findByIds(h, idsOf(listings));
        expect(found).toHaveLength(100);
        expect(sorted(idsOf(found))).toEqual(sorted(idsOf(listings)));
      });

      it("listingRepository#24 掲載を insert している / 101件の ID で findByIds する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await insertListings(h, listing);
        const ids = [
          listing.id,
          ...Array.from({ length: 100 }, () => f.listingId()),
        ];
        await expectBusinessRuleError(
          findByIds(h, ids),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("findPageByPlace", () => {
      it("listingRepository#25 店舗 A に、下書き、公開中、一時非公開、運営による非公開の掲載を insert している。店舗 B にも掲載を insert している / 店舗 A、{ publication: null, phase: null } で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const [a, b] = [f.place(), f.place()];
        const ofA = [
          f.draft(a),
          f.published(a),
          f.unpublished(a),
          f.suspended(f.published(a)),
        ];
        await insertListings(h, ...ofA, f.published(b));
        const result = await byPlace(h, a, ALL);
        expect(result.count).toBe(4);
        expect(sorted(idsOf(result.items))).toEqual(sorted(idsOf(ofA)));
      });

      it('listingRepository#26 店舗 A に、公開中で提供中の掲載と、公開中で提供開始前（開始日 2026-07-20）の掲載がある / { publication: "published" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const available = f.published(a);
        const upcoming = f.published(a, {
          offering: period("2026-07-20", null),
        });
        await insertListings(h, available, upcoming);
        const result = await byPlace(h, a, {
          publication: "published",
          phase: null,
        });
        expect(sorted(idsOf(result.items))).toEqual(
          sorted([available.id, upcoming.id]),
        );
      });

      it('listingRepository#27 店舗 A に、下書きと、運営による非公開の下書きがある / { publication: "draft" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const draft = f.draft(a);
        await insertListings(h, draft, f.suspended(f.draft(a)));
        const result = await byPlace(h, a, {
          publication: "draft",
          phase: null,
        });
        expect(idsOf(result.items)).toEqual([draft.id]);
      });

      it('listingRepository#28 店舗 A に、一時非公開の掲載、運営による非公開の公開中の掲載、運営による非公開の下書きがある / { publication: "hidden" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listings = [
          f.unpublished(a),
          f.suspended(f.published(a)),
          f.suspended(f.draft(a)),
        ];
        await insertListings(h, ...listings);
        const result = await byPlace(h, a, {
          publication: "hidden",
          phase: null,
        });
        expect(sorted(idsOf(result.items))).toEqual(sorted(idsOf(listings)));
      });

      it('listingRepository#29 店舗 A に、終了日 2026-06-30 の公開中の掲載、manualEnd が { ended: true } の公開中の掲載、最後の開催日が 2026-07-09 の公開中の掲載がある / { phase: "ended" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listings = [
          f.published(a, { offering: period(null, "2026-06-30") }),
          f.manuallyEnded(a),
          f.published(a, { offering: openDates("2026-07-01", "2026-07-09") }),
        ];
        await insertListings(h, ...listings, f.published(a));
        const result = await byPlace(h, a, {
          publication: null,
          phase: "ended",
        });
        expect(sorted(idsOf(result.items))).toEqual(sorted(idsOf(listings)));
      });

      it('listingRepository#30 店舗 A に、終了日 2026-06-30 の一時非公開の掲載と、終了日 2026-06-30 の下書きがある / { phase: "ended" }、{ publication: "hidden" }、{ publication: "draft" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const pastEnd = period(null, "2026-06-30");
        const unpublished = f.unpublished(a, { offering: pastEnd });
        const draft = f.draft(a, { offering: pastEnd });
        await insertListings(h, unpublished, draft);
        const ended = await byPlace(h, a, {
          publication: null,
          phase: "ended",
        });
        expect(sorted(idsOf(ended.items))).toEqual(
          sorted([unpublished.id, draft.id]),
        );
        const hidden = await byPlace(h, a, {
          publication: "hidden",
          phase: null,
        });
        expect(idsOf(hidden.items)).toEqual([unpublished.id]);
        const drafts = await byPlace(h, a, {
          publication: "draft",
          phase: null,
        });
        expect(idsOf(drafts.items)).toEqual([draft.id]);
      });

      it('listingRepository#31 店舗 A に、終了日 2026-06-30 の公開中の掲載 X と、終了日 2026-06-30 の下書き Y がある / { publication: "published", phase: "ended" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const pastEnd = period(null, "2026-06-30");
        const x = f.published(a, { offering: pastEnd });
        await insertListings(h, x, f.draft(a, { offering: pastEnd }));
        const result = await byPlace(h, a, {
          publication: "published",
          phase: "ended",
        });
        expect(idsOf(result.items)).toEqual([x.id]);
      });

      it('listingRepository#32 店舗 A に、開始日 2026-07-20 の公開中の掲載 X、開始日 2026-07-20 の下書き Y、開始日 2026-07-01 の公開中の掲載 Z、開始日 2026-07-20 で manualEnd が { ended: true } の公開中の掲載 W がある / { phase: "upcoming" } と { phase: "available" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const later = period("2026-07-20", null);
        const x = f.published(a, { offering: later });
        const y = f.draft(a, { offering: later });
        const z = f.published(a, { offering: period("2026-07-01", null) });
        const w = f.manuallyEnded(a, { offering: later });
        await insertListings(h, x, y, z, w);
        const upcoming = await byPlace(h, a, {
          publication: null,
          phase: "upcoming",
        });
        expect(sorted(idsOf(upcoming.items))).toEqual(sorted([x.id, y.id]));
        const available = await byPlace(h, a, {
          publication: null,
          phase: "available",
        });
        expect(idsOf(available.items)).toEqual([z.id]);
      });

      it('listingRepository#33 店舗 A に、開始日 2026-07-20 の公開中の掲載がある / today に 2026-07-19 と 2026-07-20 を渡して、{ phase: "upcoming" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listing = f.published(a, {
          offering: period("2026-07-20", null),
        });
        await insertListings(h, listing);
        const shelf = { publication: null, phase: "upcoming" } as const;
        expect(
          idsOf((await byPlace(h, a, shelf, day("2026-07-19"))).items),
        ).toEqual([listing.id]);
        expect((await byPlace(h, a, shelf, day("2026-07-20"))).items).toEqual(
          [],
        );
      });

      it('listingRepository#34 店舗 A に、終了日 2026-07-15 の公開中の掲載がある / today に 2026-07-10 と 2026-07-16 を渡して、{ publication: "published" } と { phase: "ended" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listing = f.published(a, {
          offering: period(null, "2026-07-15"),
        });
        await insertListings(h, listing);
        const published = { publication: "published", phase: null } as const;
        const ended = { publication: null, phase: "ended" } as const;
        expect(
          idsOf((await byPlace(h, a, published, day("2026-07-10"))).items),
        ).toEqual([listing.id]);
        expect((await byPlace(h, a, ended, day("2026-07-10"))).items).toEqual(
          [],
        );
        expect(
          idsOf((await byPlace(h, a, published, day("2026-07-16"))).items),
        ).toEqual([listing.id]);
        expect(
          idsOf((await byPlace(h, a, ended, day("2026-07-16"))).items),
        ).toEqual([listing.id]);
      });

      it('listingRepository#35 店舗 A に、終了日 2026-06-30 の公開中の掲載 X がある / X の提供期間の終了日を 2026-08-31 に変えた掲載を save し、{ phase: "ended" } で読み、countByPlace を読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const x = f.published(a, { offering: period(null, "2026-06-30") });
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        const extended = Listing.update(
          read.entity,
          { ...read.entity.content, offering: period(null, "2026-08-31") },
          f.catalogOf([f.defaultCategory]),
          f.tick(),
        ).entity;
        await saveListing(h, extended, read.expectedVersion);
        expect(
          (await byPlace(h, a, { publication: null, phase: "ended" })).items,
        ).toEqual([]);
        expect((await counts(h, a)).phase.ended).toBe(0);
      });

      it('listingRepository#36 店舗 A に、開始日 2026-07-20 の公開中の掲載 X がある / X を endOffering で提供終了にした掲載を save し、{ phase: "ended" } で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const x = f.published(a, { offering: period("2026-07-20", null) });
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        await saveListing(
          h,
          Listing.endOffering(read.entity, f.tick()).entity,
          read.expectedVersion,
        );
        expect(
          idsOf(
            (await byPlace(h, a, { publication: null, phase: "ended" })).items,
          ),
        ).toEqual([x.id]);
      });

      it("listingRepository#37 店舗 A に、updatedAt が古い順に X、Y、Z の掲載がある / { publication: null, phase: null } で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const [x, y, z] = [f.draft(a), f.draft(a), f.draft(a)];
        await insertListings(h, x, z, y);
        expect(idsOf((await byPlace(h, a, ALL)).items)).toEqual([
          z.id,
          y.id,
          x.id,
        ]);
      });

      it("listingRepository#38 店舗 A に、updatedAt が同じ掲載が2件ある / { publication: null, phase: null } で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const at = f.tick();
        const first = f.draft(a, {}, at);
        const second = f.draft(a, {}, at);
        await insertListings(h, second, first);
        expect(idsOf((await byPlace(h, a, ALL)).items)).toEqual(
          sorted([first.id, second.id]),
        );
      });

      it("listingRepository#39 店舗 A の掲載 X を save して、updatedAt を最も新しくした / { publication: null, phase: null } で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const [x, y] = [f.draft(a), f.draft(a)];
        await insertListings(h, x, y);
        const read = await getListing(h, x.id);
        await saveListing(
          h,
          renamed(f, read.entity, "更新", f.tick()),
          read.expectedVersion,
        );
        expect(idsOf((await byPlace(h, a, ALL)).items)).toEqual([x.id, y.id]);
      });

      it("listingRepository#40 店舗 A に掲載がない / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        expect(await byPlace(h, f.place(), ALL)).toEqual({
          items: [],
          count: 0,
        });
      });

      it("listingRepository#41 店舗 A に掲載が1件ある / page: 1、limit: 10 で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listing = f.draft(a);
        await insertListings(h, listing);
        const result = await byPlace(h, a, ALL, TODAY, page(1, 10));
        expect(idsOf(result.items)).toEqual([listing.id]);
        expect(result.count).toBe(1);
      });

      it("listingRepository#42 店舗 A に掲載が3件ある / page: 1、limit: 3 で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        await insertListings(h, f.draft(a), f.draft(a), f.draft(a));
        const result = await byPlace(h, a, ALL, TODAY, page(1, 3));
        expect(result.items).toHaveLength(3);
        expect(result.count).toBe(3);
      });

      it("listingRepository#43 店舗 A に掲載が5件ある / limit: 3 で、page: 1 と page: 2 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listings = Array.from({ length: 5 }, () => f.draft(a));
        await insertListings(h, ...listings);
        const newestFirst = idsOf([...listings].reverse());
        const first = await byPlace(h, a, ALL, TODAY, page(1, 3));
        const second = await byPlace(h, a, ALL, TODAY, page(2, 3));
        expect(idsOf(first.items)).toEqual(newestFirst.slice(0, 3));
        expect(idsOf(second.items)).toEqual(newestFirst.slice(3));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("listingRepository#44 店舗 A に掲載が5件ある / page: 3、limit: 3 で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        await insertListings(h, ...Array.from({ length: 5 }, () => f.draft(a)));
        expect(await byPlace(h, a, ALL, TODAY, page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });

      it('listingRepository#45 店舗 A に公開中の掲載が2件、下書きが3件ある / { publication: "draft" }、limit: 2 で読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        await insertListings(
          h,
          f.published(a),
          f.published(a),
          f.draft(a),
          f.draft(a),
          f.draft(a),
        );
        const result = await byPlace(
          h,
          a,
          { publication: "draft", phase: null },
          TODAY,
          page(1, 2),
        );
        expect(result.items).toHaveLength(2);
        expect(
          result.items.every((l) => l.publication.status === "draft"),
        ).toBe(true);
        expect(result.count).toBe(3);
      });
    });

    describe("countByPlace", () => {
      const seedEight = (f: ReturnType<typeof listingFactory>) => {
        const a = f.place();
        return {
          a,
          listings: [
            f.published(a),
            f.published(a),
            f.published(a, { offering: period("2026-07-20", null) }),
            f.draft(a),
            f.unpublished(a),
            f.suspended(f.published(a)),
            f.published(a, { offering: period(null, "2026-06-30") }),
            f.manuallyEnded(a),
          ],
        };
      };

      it("listingRepository#46 店舗 A に、公開中で提供中が2件、公開中で提供開始前が1件、下書き（提供の設定なし）が1件、一時非公開（提供の設定なし）が1件、運営による非公開の公開中（提供中）が1件、公開中で期日による提供終了が1件、公開中で manualEnd による提供終了が1件ある / countByPlace を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const { a, listings } = seedEight(f);
        await insertListings(h, ...listings);
        expect(await counts(h, a)).toEqual({
          publication: { published: 5, draft: 1, hidden: 2 },
          phase: { upcoming: 1, available: 5, ended: 2 },
        });
      });

      it("listingRepository#47 上と同じ / 公開状態の区分ごと、提供状態の段階ごとに、もう一方を null にして findPageByPlace を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const { a, listings } = seedEight(f);
        await insertListings(h, ...listings);
        const c = await counts(h, a);
        for (const publication of ["published", "draft", "hidden"] as const) {
          expect(
            (await byPlace(h, a, { publication, phase: null })).count,
          ).toBe(c.publication[publication]);
        }
        for (const phase of ["upcoming", "available", "ended"] as const) {
          expect(
            (await byPlace(h, a, { publication: null, phase })).count,
          ).toBe(c.phase[phase]);
        }
      });

      it("listingRepository#48 店舗 A に掲載がない / countByPlace を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        expect(await counts(h, f.place())).toEqual({
          publication: { published: 0, draft: 0, hidden: 0 },
          phase: { upcoming: 0, available: 0, ended: 0 },
        });
      });

      it("listingRepository#49 店舗 A に、終了日 2026-07-15 の公開中の掲載がある / today に 2026-07-10 と 2026-07-16 を渡して読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        await insertListings(
          h,
          f.published(a, { offering: period(null, "2026-07-15") }),
        );
        const before = await counts(h, a, day("2026-07-10"));
        const after = await counts(h, a, day("2026-07-16"));
        expect(before.publication.published).toBe(1);
        expect(after.publication.published).toBe(1);
        expect(before.phase).toEqual({ upcoming: 0, available: 1, ended: 0 });
        expect(after.phase).toEqual({ upcoming: 0, available: 0, ended: 1 });
      });

      it("listingRepository#50 店舗 A と店舗 B に掲載がある / 店舗 A で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const [a, b] = [f.place(), f.place()];
        await insertListings(h, f.published(a), f.published(b), f.draft(b));
        expect(await counts(h, a)).toEqual({
          publication: { published: 1, draft: 0, hidden: 0 },
          phase: { upcoming: 0, available: 1, ended: 0 },
        });
      });
    });

    describe("findPageAttachable", () => {
      it("listingRepository#51 店舗 A に、公開中で提供開始前・提供中・期日による提供終了・manualEnd による提供終了の掲載、下書き、一時非公開の掲載、運営による非公開の公開中の掲載がある。店舗 B に公開中の掲載がある / 店舗 A で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const [a, b] = [f.place(), f.place()];
        const attachableOnes = [
          f.published(a, { offering: period("2026-07-20", null) }),
          f.published(a),
          f.published(a, { offering: period(null, "2026-06-30") }),
          f.manuallyEnded(a),
        ];
        const all = [
          ...attachableOnes,
          f.draft(a),
          f.unpublished(a),
          f.suspended(f.published(a)),
        ];
        await insertListings(h, ...all, f.published(b));
        const result = await attachable(h, a);
        expect(result.count).toBe(4);
        expect(sorted(idsOf(result.items))).toEqual(
          sorted(idsOf(attachableOnes)),
        );
        expect(sorted(idsOf(result.items))).toEqual(
          sorted(Listing.attachableIds(all, a, TODAY)),
        );
      });

      it("listingRepository#52 店舗 A の公開中の掲載 X と、updatedAt がより新しい公開中の掲載 Y がある / 店舗 A で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const x = f.published(a);
        const y = f.published(a);
        await insertListings(h, x, y);
        expect(idsOf((await attachable(h, a)).items)).toEqual([y.id, x.id]);
      });

      it("listingRepository#53 店舗 A に、updatedAt が同じ公開中の掲載が2件ある / 店舗 A で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const at = f.tick();
        const first = f.published(a, {}, at);
        const second = f.published(a, {}, at);
        await insertListings(h, second, first);
        expect(idsOf((await attachable(h, a)).items)).toEqual(
          sorted([first.id, second.id]),
        );
      });

      it("listingRepository#54 店舗 A に公開中の掲載が5件ある / limit: 3 で、page: 1 と page: 2 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        const listings = Array.from({ length: 5 }, () => f.published(a));
        await insertListings(h, ...listings);
        const newestFirst = idsOf([...listings].reverse());
        const first = await attachable(h, a, page(1, 3));
        const second = await attachable(h, a, page(2, 3));
        expect(idsOf(first.items)).toEqual(newestFirst.slice(0, 3));
        expect(idsOf(second.items)).toEqual(newestFirst.slice(3));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("listingRepository#55 店舗 A に公開中の掲載がない / 店舗 A で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const a = f.place();
        await insertListings(h, f.draft(a));
        expect(await attachable(h, a)).toEqual({ items: [], count: 0 });
      });
    });

    describe("findPageByCategories", () => {
      const seed = (f: ReturnType<typeof listingFactory>) => {
        const [c1, c2] = [f.category(), f.category()];
        const p = f.place();
        const ofC1 = [
          f.draft(p, { categoryId: c1 }),
          f.published(p, { categoryId: c1 }),
          f.unpublished(p, { categoryId: c1 }),
          f.suspended(f.published(p, { categoryId: c1 })),
        ];
        const ofC2 = f.draft(p, { categoryId: c2 });
        const none = f.draft(p, { categoryId: null });
        return { c1, c2, ofC1, ofC2, none };
      };

      it("listingRepository#56 categoryId が C1 の、下書き、公開中、一時非公開、運営による非公開の掲載と、categoryId が C2 の掲載、categoryId が null の掲載を insert している / [C1] で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const { c1, ofC1, ofC2, none } = seed(f);
        await insertListings(h, ...ofC1, ofC2, none);
        const result = await byCategories(h, [c1]);
        expect(idsOf(result.items)).toEqual(sorted(idsOf(ofC1)));
        expect(result.count).toBe(4);
      });

      it("listingRepository#57 上と同じ / [C1, C2] で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const { c1, c2, ofC1, ofC2, none } = seed(f);
        await insertListings(h, ...ofC1, ofC2, none);
        const result = await byCategories(h, [c1, c2]);
        expect(idsOf(result.items)).toEqual(sorted([...idsOf(ofC1), ofC2.id]));
      });

      it("listingRepository#58 台帳では C1 が廃止済みで移行先が C2。categoryId が C1 の掲載と C2 の掲載がある / [C2] で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const [c1, c2] = [f.category(), f.category()];
        const p = f.place();
        const ofC1 = f.draft(p, { categoryId: c1 });
        const ofC2 = f.draft(p, { categoryId: c2 });
        await insertListings(h, ofC1, ofC2);
        await h.uow.run(async ({ categoryCatalogRepository }) => {
          const read = await categoryCatalogRepository.find();
          const established = f.catalogOf([c1, c2]);
          await categoryCatalogRepository.save(
            CategoryCatalog.retire(established, c1, c2, f.tick()).entity,
            read.expectedVersion,
          );
        });
        expect(idsOf((await byCategories(h, [c2])).items)).toEqual([ofC2.id]);
      });

      it("listingRepository#59 categoryId が C1 の掲載と C2 の掲載が複数ある / [C1, C2] で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const [c1, c2] = [f.category(), f.category()];
        const p = f.place();
        const listings = [
          f.draft(p, { categoryId: c2 }),
          f.draft(p, { categoryId: c1 }),
          f.draft(p, { categoryId: c2 }),
          f.draft(p, { categoryId: c1 }),
        ];
        await insertListings(h, ...[...listings].reverse());
        expect(idsOf((await byCategories(h, [c1, c2])).items)).toEqual(
          sorted(idsOf(listings)),
        );
      });

      it("listingRepository#60 掲載がある / 空の集合で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await insertListings(h, f.draft(f.place()));
        expect(await byCategories(h, [])).toEqual({ items: [], count: 0 });
      });

      it("listingRepository#61 互いに違う101個の CategoryId のうち1つを categoryId に持つ掲載がある / 101個の集合で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const many = Array.from({ length: 101 }, () => f.category());
        const target = many[57] ?? f.category();
        const listing = f.draft(f.place(), { categoryId: target });
        await insertListings(h, listing);
        expect(idsOf((await byCategories(h, many)).items)).toEqual([
          listing.id,
        ]);
      });

      it("listingRepository#62 categoryId が C1 の掲載がない / [C1] で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const c1 = f.category();
        await insertListings(h, f.draft(f.place()));
        expect(await byCategories(h, [c1])).toEqual({ items: [], count: 0 });
      });

      it("listingRepository#63 categoryId が C1 の掲載が1件ある / page: 1、limit: 10 で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const c1 = f.category();
        const listing = f.draft(f.place(), { categoryId: c1 });
        await insertListings(h, listing);
        const result = await byCategories(h, [c1], page(1, 10));
        expect(idsOf(result.items)).toEqual([listing.id]);
        expect(result.count).toBe(1);
      });

      it("listingRepository#64 categoryId が C1 の掲載が5件ある / limit: 5 で page: 1 を、limit: 3 で page: 1・page: 2・page: 3 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const c1 = f.category();
        const p = f.place();
        const listings = Array.from({ length: 5 }, () =>
          f.draft(p, { categoryId: c1 }),
        );
        await insertListings(h, ...listings);
        const ordered = sorted(idsOf(listings));
        const all = await byCategories(h, [c1], page(1, 5));
        const pages = await Promise.all(
          [1, 2, 3].map((n) => byCategories(h, [c1], page(n, 3))),
        );
        expect(idsOf(all.items)).toEqual(ordered);
        expect(pages.map((r) => idsOf(r.items))).toEqual([
          ordered.slice(0, 3),
          ordered.slice(3),
          [],
        ]);
        expect([all, ...pages].map((r) => r.count)).toEqual([5, 5, 5, 5]);
      });
    });

    describe("searchForOperation", () => {
      it("a keyword whose terms NFKC expands past 100 characters is searched, not refused", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const long = f.draft(p, {
          name: "社名",
          description: "株式会社".repeat(30),
        });
        await insertListings(h, long, f.draft(p));
        const result = await search(h, keyword("㍿".repeat(30)));
        expect(idsOf(result.items)).toEqual([long.id]);
      });

      it("listingRepository#65 名称に「りんご」を含む掲載、説明に「りんご」を含む掲載、どちらにも含まない掲載がある / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const inName = f.draft(p, { name: "青森のりんご" });
        const inDescription = f.draft(p, {
          name: "ジュース",
          description: "りんごを搾った",
        });
        await insertListings(
          h,
          inName,
          inDescription,
          f.draft(p, { name: "みかん" }),
        );
        const result = await search(h, keyword("りんご"));
        expect(sorted(idsOf(result.items))).toEqual(
          sorted([inName.id, inDescription.id]),
        );
      });

      it("listingRepository#66 名称に「りんご」を含む、下書き、公開中、一時非公開、運営による非公開の掲載がある / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const spec = { name: "りんご" };
        const listings = [
          f.draft(p, spec),
          f.published(p, spec),
          f.unpublished(p, spec),
          f.suspended(f.published(p, spec)),
        ];
        await insertListings(h, ...listings);
        const result = await search(h, keyword("りんご"));
        expect(sorted(idsOf(result.items))).toEqual(sorted(idsOf(listings)));
      });

      it("listingRepository#67 名称が「Apple Pie」の掲載がある / 「apple」と「APPLE」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "Apple Pie" });
        await insertListings(h, listing);
        for (const kw of ["apple", "APPLE"]) {
          expect(idsOf((await search(h, keyword(kw))).items)).toEqual([
            listing.id,
          ]);
        }
      });

      it("listingRepository#68 名称が「Apple Pie」の掲載がある / 全角の「ＡＰＰＬＥ」と、空白のない「applepie」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "Apple Pie" });
        await insertListings(h, listing);
        for (const kw of ["ＡＰＰＬＥ", "applepie"]) {
          expect(idsOf((await search(h, keyword(kw))).items)).toEqual([
            listing.id,
          ]);
        }
      });

      it("listingRepository#69 名称が「ＣＡＦＥ　ラテ」（全角の英字と全角の空白）の掲載がある / 「cafeラテ」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "ＣＡＦＥ　ラテ" });
        await insertListings(h, listing);
        expect(idsOf((await search(h, keyword("cafeラテ"))).items)).toEqual([
          listing.id,
        ]);
      });

      it("listingRepository#70 名称が「ÉCLAIR」の掲載がある / 「éclair」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "ÉCLAIR" });
        await insertListings(h, listing);
        expect(idsOf((await search(h, keyword("éclair"))).items)).toEqual([
          listing.id,
        ]);
      });

      it("listingRepository#71 名称が「青森のりんごジュース」の掲載がある / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "青森のりんごジュース" });
        await insertListings(h, listing);
        expect(idsOf((await search(h, keyword("りんご"))).items)).toEqual([
          listing.id,
        ]);
      });

      it("listingRepository#72 名称が「青森のりんごジュース」の掲載 X と、名称が「りんご飴」の掲載 Y がある / 「ジュース りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const x = f.draft(p, { name: "青森のりんごジュース" });
        await insertListings(h, x, f.draft(p, { name: "りんご飴" }));
        expect(
          idsOf((await search(h, keyword("ジュース りんご"))).items),
        ).toEqual([x.id]);
      });

      it("listingRepository#73 名称が「りんご」で説明に「ジュース向き」とある掲載 X がある / 「りんご ジュース」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.draft(f.place(), {
          name: "りんご",
          description: "ジュース向き",
        });
        await insertListings(h, x);
        expect(
          idsOf((await search(h, keyword("りんご ジュース"))).items),
        ).toEqual([x.id]);
      });

      it("listingRepository#74 名称が「りんご」の掲載 A、「りんご飴」の掲載 B、「青森のりんご」の掲載 C、説明にだけ「りんご」を含む掲載 D があり、ID は D < C < B < A / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const d = f.draft(p, { name: "ジャム", description: "りんごの" });
        const c = f.draft(p, { name: "青森のりんご" });
        const b = f.draft(p, { name: "りんご飴" });
        const a = f.draft(p, { name: "りんご" });
        await insertListings(h, a, b, c, d);
        expect(idsOf((await search(h, keyword("りんご"))).items)).toEqual([
          a.id,
          b.id,
          c.id,
          d.id,
        ]);
      });

      it("listingRepository#75 名称が null で、説明も null の掲載がある / 任意のキーワードで探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await insertListings(
          h,
          f.draft(f.place(), { name: null, description: null }),
        );
        for (const kw of ["りんご", "a", "掲載"]) {
          expect(await search(h, keyword(kw))).toEqual({ items: [], count: 0 });
        }
      });

      it("listingRepository#76 説明にだけ「りんご」を含む掲載 X（ID が小さい）と、名称に「りんご」を含む掲載 Y（ID が大きい）がある / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const x = f.draft(p, { name: "ジャム", description: "りんごの" });
        const y = f.draft(p, { name: "青森のりんご" });
        await insertListings(h, x, y);
        expect(idsOf((await search(h, keyword("りんご"))).items)).toEqual([
          y.id,
          x.id,
        ]);
      });

      it("listingRepository#77 名称が「青森のりんご」の掲載が2件ある / 「りんご」で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const first = f.draft(p, { name: "青森のりんご" });
        const second = f.draft(p, { name: "青森のりんご" });
        await insertListings(h, second, first);
        expect(idsOf((await search(h, keyword("りんご"))).items)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("listingRepository#78 キーワードを含む掲載がない / 探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await insertListings(h, f.draft(f.place(), { name: "みかん" }));
        expect(await search(h, keyword("りんご"))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("listingRepository#79 キーワードを含む掲載が1件ある / page: 1、limit: 10 で探す", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place(), { name: "りんご" });
        await insertListings(h, listing);
        const result = await search(h, keyword("りんご"), page(1, 10));
        expect(idsOf(result.items)).toEqual([listing.id]);
        expect(result.count).toBe(1);
      });

      it("listingRepository#80 キーワードを含む掲載が5件ある / limit: 5 で page: 1 を、limit: 3 で page: 1・page: 2・page: 3 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = Array.from({ length: 5 }, () =>
          f.draft(p, { name: "りんご" }),
        );
        await insertListings(h, ...listings);
        const ordered = sorted(idsOf(listings));
        const kw = keyword("りんご");
        const all = await search(h, kw, page(1, 5));
        const pages = await Promise.all(
          [1, 2, 3].map((n) => search(h, kw, page(n, 3))),
        );
        expect(idsOf(all.items)).toEqual(ordered);
        expect(pages.map((r) => idsOf(r.items))).toEqual([
          ordered.slice(0, 3),
          ordered.slice(3),
          [],
        ]);
        expect([all, ...pages].map((r) => r.count)).toEqual([5, 5, 5, 5]);
      });
    });

    describe("可視性と UnitOfWork", () => {
      /** Every query that could show `listing` (its place, category, name). */
      async function visibleEverywhere(
        h: H,
        listing: Listing,
      ): Promise<boolean[]> {
        const hit = (items: readonly Listing[]) =>
          items.some((item) => item.id === listing.id);
        const c = await counts(h, listing.placeId);
        return [
          (await findListing(h, listing.id)) !== null,
          hit(await findByIds(h, [listing.id])),
          hit((await byPlace(h, listing.placeId, ALL)).items),
          c.publication.published + c.publication.draft + c.publication.hidden >
            0,
          hit((await attachable(h, listing.placeId)).items),
          hit(
            (
              await byCategories(
                h,
                listing.content.categoryId === null
                  ? []
                  : [listing.content.categoryId],
              )
            ).items,
          ),
          hit((await search(h, keyword(listing.content.name ?? "x"))).items),
        ];
      }

      it("listingRepository#81 掲載がない / UnitOfWorkProvider.run の中で掲載を insert し、値を返してコミットする", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.published(f.place(), { name: "りんご" });
        const returned = await h.uow.run(async ({ listingRepository }) => {
          await listingRepository.insert(listing);
          return "done";
        });
        expect(returned).toBe("done");
        expect(await visibleEverywhere(h, listing)).toEqual(
          Array.from({ length: 7 }, () => true),
        );
      });

      it("listingRepository#82 掲載 X を insert している / run の中で X を save し、コミットする", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place(), { name: "りんご" });
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        const next = renamed(f, read.entity, "みかん", f.tick());
        await h.uow.run(({ listingRepository }) =>
          listingRepository.save(next, read.expectedVersion),
        );
        expect((await getListing(h, x.id)).entity).toEqual(next);
        expect(idsOf((await search(h, keyword("みかん"))).items)).toEqual([
          x.id,
        ]);
        expect((await search(h, keyword("りんご"))).items).toEqual([]);
        expect((await byPlace(h, x.placeId, ALL)).items).toEqual([next]);
      });

      it("listingRepository#83 掲載がない / run の中で掲載を insert した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.published(f.place(), { name: "りんご" });
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            await listingRepository.insert(listing);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await visibleEverywhere(h, listing)).toEqual(
          Array.from({ length: 7 }, () => false),
        );
      });

      it("listingRepository#84 掲載 X を insert している / run の中で X を save した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.draft(f.place());
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            await listingRepository.save(
              renamed(f, read.entity, "後", f.tick()),
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getListing(h, x.id);
        expect(after.entity).toEqual(x);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });

      it("listingRepository#85 掲載 X を insert している / run の中で X を delete した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place(), { name: "りんご" });
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            await listingRepository.delete(x.id, read.expectedVersion);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await visibleEverywhere(h, x)).toEqual(
          Array.from({ length: 7 }, () => true),
        );
      });

      it("listingRepository#86 掲載 X と Y を insert している / run の中で X を save し、Y を古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const [x, y] = [f.draft(p), f.draft(p)];
        await insertListings(h, x, y);
        const readX = await getListing(h, x.id);
        const readY = await getListing(h, y.id);
        await saveListing(
          h,
          renamed(f, readY.entity, "先", f.tick()),
          readY.expectedVersion,
        );
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            await listingRepository.save(
              renamed(f, readX.entity, "X", f.tick()),
              readX.expectedVersion,
            );
            await listingRepository.save(
              renamed(f, readY.entity, "Y", f.tick()),
              readY.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getListing(h, x.id)).entity).toEqual(x);
      });

      it("listingRepository#87 掲載がない / run の中で、同じ ID の掲載を2回 insert する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const listing = f.draft(f.place());
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            await listingRepository.insert(listing);
            await listingRepository.insert(listing);
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findListing(h, listing.id)).toBeNull();
      });
    });

    describe("isDeleted", () => {
      it("listingRepository#88 掲載 X を insert し、delete している。掲載 Y を insert している / isDeleted(X.id)、isDeleted(Y.id)、isDeleted（一度も作られていない ID）", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const place = f.place();
        const [x, y] = [f.draft(place), f.draft(place)];
        const never = f.draft(place);
        await insertListings(h, x, y);
        const read = await getListing(h, x.id);
        await deleteListing(h, x.id, read.expectedVersion);

        const answers = await h.uow.run(async ({ listingRepository }) => [
          await listingRepository.isDeleted(x.id),
          await listingRepository.isDeleted(y.id),
          await listingRepository.isDeleted(never.id),
        ]);

        expect(answers).toEqual([true, false, false]);
      });
    });
  });
}
