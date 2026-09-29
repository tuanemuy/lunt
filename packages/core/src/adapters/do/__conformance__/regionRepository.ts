import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { RegionId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import type { RegionContentInput } from "@repo/core/domain/region/content";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  emptyRegionContent,
  findRegion,
  getRegion,
  insertRegions,
  newRegion,
  publishedRegion,
  regionContent,
  regionIds,
  saveRegion,
  ticker,
  updateRegion,
} from "./regionFixtures";

const ALL: Pagination = { page: 1, limit: 100 };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected a rejection");
    },
    (error: unknown) => error,
  );
}

function search(
  h: ConformanceHarness,
  keyword: string,
  pagination: Pagination = ALL,
) {
  return h.uow.run(({ regionRepository }) =>
    regionRepository.searchForOperation(
      SearchKeyword.create(keyword),
      pagination,
    ),
  );
}

const idsOf = (result: Readonly<{ items: readonly Region[] }>) =>
  result.items.map((region) => region.id);

function findByIds(h: ConformanceHarness, ids: readonly RegionId[]) {
  return h.uow.run(({ regionRepository }) => regionRepository.findByIds(ids));
}

const sortedIds = (regions: readonly Region[]) =>
  regions.map((region) => region.id).sort();

/** A draft region with only the given fields entered (name defaults to `name`). */
function named(
  id: RegionId,
  name: string | null,
  overrides: Partial<RegionContentInput> = {},
): Region {
  return newRegion(
    id,
    regionContent({
      name,
      description: null,
      tagline: null,
      ...overrides,
    }),
  );
}

/** `spec/testcases/ports/regionRepository.md`. */
export function describeRegionRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("RegionRepository contract", () => {
    describe("insert・findById・save", () => {
      it("regionRepository#1 地域が保存されていない / すべての項目を入力した draft の地域を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const r = newRegion(
          ids.region(),
          regionContent({ photoIds: [ids.photo(), ids.photo()] }),
        );
        await insertRegions(h, r);
        const found = await getRegion(h, r.id);
        expect(found.entity).toEqual(r);
        expect(found.entity.publication).toEqual({ status: "draft" });
        expect(found.entity.suspension.suspended).toBe(false);
        expect(found.entity.content.photos.items).toEqual(
          r.content.photos.items,
        );
        expect(found.expectedVersion).toBe(r.version);
      });

      it("regionRepository#2 地域が保存されていない / 名称・所在地・位置・紹介・キャッチコピーが null で、写真が空の draft の地域を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const r = newRegion(regionIds().region(), emptyRegionContent());
        await insertRegions(h, r);
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(r);
        expect(found.content).toMatchObject({
          name: null,
          address: null,
          location: null,
          description: null,
          tagline: null,
        });
        expect(found.content.photos.items).toEqual([]);
      });

      it("regionRepository#3 地域が保存されていない / findById を呼ぶ", async () => {
        const h = await makeHarness();
        expect(await findRegion(h, regionIds().region())).toBeNull();
      });

      it("regionRepository#4 ID が同じ地域が保存されている / 同じ ID の地域を insert する", async () => {
        const h = await makeHarness();
        const id = regionIds().region();
        const first = named(id, "谷中");
        await insertRegions(h, first);
        await expect(
          insertRegions(h, named(id, "根津")),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegion(h, id)).entity).toEqual(first);
      });

      it("regionRepository#5 同じ名称の地域が保存されている / 別の ID で、同じ名称の地域を insert する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const a = named(ids.region(), "谷中");
        const b = named(ids.region(), "谷中");
        await insertRegions(h, a);
        await insertRegions(h, b);
        expect((await getRegion(h, a.id)).entity).toEqual(a);
        expect((await getRegion(h, b.id)).entity).toEqual(b);
      });

      it("regionRepository#6 draft の地域が保存されている / findById の expectedVersion で、published にした地域を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const tick = ticker();
        const r = newRegion(
          ids.region(),
          regionContent({ photoIds: [ids.photo()] }),
        );
        await insertRegions(h, r);
        const read = await getRegion(h, r.id);
        const now = tick();
        const published = Region.publish(read.entity, now).entity;
        await saveRegion(h, published, read.expectedVersion);
        const found = await getRegion(h, r.id);
        expect(found.entity).toEqual(published);
        expect(found.entity.publication).toEqual({
          status: "published",
          firstPublishedAt: now,
        });
        expect(found.entity.version).toBe(r.version + 1);
        expect(found.expectedVersion).toBe(published.version);
      });

      it("regionRepository#7 published の地域が保存されている / unpublished（byManager）にした地域を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const r = publishedRegion(ids.region(), [ids.photo()]);
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) => Region.unpublish(region, ticker()()).entity,
        );
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(saved);
        expect(found.publication).toEqual({
          status: "unpublished",
          reason: "byManager",
          firstPublishedAt:
            r.publication.status === "published"
              ? r.publication.firstPublishedAt
              : null,
        });
      });

      it("regionRepository#8 published の地域が保存されている / unpublished（photoTakedown）にした地域を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const photo = ids.photo();
        const r = publishedRegion(ids.region(), [photo]);
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) => Region.takeDownPhotos(region, [photo], ticker()()).entity,
        );
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(saved);
        expect(found.publication).toMatchObject({
          status: "unpublished",
          reason: "photoTakedown",
        });
      });

      it("regionRepository#9 published の地域が保存されている / 運営による非公開にした地域を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const r = publishedRegion(ids.region(), [ids.photo()]);
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) => Region.suspend(region, ticker()()).entity,
        );
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(saved);
        expect(found.publication.status).toBe("published");
        expect(found.suspension).toEqual({ suspended: true });
      });

      it("regionRepository#10 地域が保存されている / 地域情報を置き換えた地域（写真の並び替えを含む）を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [A, B] = [ids.photo(), ids.photo()];
        const r = publishedRegion(ids.region(), [A, B]);
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({
                name: "根津",
                address: SampleAddress.ginza(),
                description: "坂の町",
                tagline: null,
                photoIds: [B, A],
              }),
              ticker()(),
            ).entity,
        );
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(saved);
        expect(found.content.name).toBe("根津");
        expect(found.content.tagline).toBeNull();
        expect(found.content.photos.items.map((p) => p.photoId)).toEqual([
          B,
          A,
        ]);
      });

      it("regionRepository#11 写真 A・B を持つ published の地域が保存されている / Region.takeDownPhotos で A を外した地域を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [A, B] = [ids.photo(), ids.photo()];
        const r = publishedRegion(ids.region(), [A, B]);
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) => Region.takeDownPhotos(region, [A], ticker()()).entity,
        );
        const found = (await getRegion(h, r.id)).entity;
        expect(found).toEqual(saved);
        expect(found.content.photos.items.map((p) => p.photoId)).toEqual([B]);
        expect(found.content.photos.takenDown).toBe(true);
        expect(found.publication.status).toBe("published");
      });

      it("regionRepository#12 地域が保存されている。findById の後に、別の save がコミットされた / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const tick = ticker();
        const r = named(ids.region(), "谷中");
        await insertRegions(h, r);
        const stale = await getRegion(h, r.id);
        const first = await updateRegion(
          h,
          r.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({ name: "根津" }),
              tick(),
            ).entity,
        );
        const error = await rejection(
          saveRegion(
            h,
            Region.updateContent(
              stale.entity,
              regionContent({ name: "千駄木" }),
              tick(),
            ).entity,
            stale.expectedVersion,
          ),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect((await getRegion(h, r.id)).entity).toEqual(first);
      });

      it("regionRepository#13 地域が保存されていない / その ID の地域を save する", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await expect(
          saveRegion(h, r, 0 as ExpectedVersion<Region>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findByIds", () => {
      it("regionRepository#14 draft・published・unpublished・運営による非公開の地域が1つずつ保存されている / 4つの ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const tick = ticker();
        const draft = named(ids.region(), "下書き");
        const published = publishedRegion(ids.region(), [ids.photo()]);
        const unpublished = Region.unpublish(
          publishedRegion(ids.region(), [ids.photo()]),
          tick(),
        ).entity;
        const suspended = Region.suspend(
          publishedRegion(ids.region(), [ids.photo()]),
          tick(),
        ).entity;
        const all = [draft, published, unpublished, suspended];
        await insertRegions(h, ...all);
        const found = await findByIds(
          h,
          [...all].reverse().map((r) => r.id),
        );
        expect(sortedIds(found)).toEqual(sortedIds(all));
        expect([...found].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(all);
      });

      it("regionRepository#15 地域 A が保存されている。ID B の地域は保存されていない / A・B の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const A = named(ids.region(), "谷中");
        await insertRegions(h, A);
        expect(await findByIds(h, [A.id, ids.region()])).toEqual([A]);
      });

      it("regionRepository#16 地域が保存されている / 空の ids で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        await insertRegions(h, named(regionIds().region(), "谷中"));
        expect(await findByIds(h, [])).toEqual([]);
      });

      it("regionRepository#17 指定する ID の地域が1つも保存されていない / findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        await insertRegions(h, named(ids.region(), "谷中"));
        expect(await findByIds(h, [ids.region(), ids.region()])).toEqual([]);
      });

      it("regionRepository#18 100 件の地域が保存されている / 100 件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const regions = Array.from({ length: 100 }, (_, i) =>
          named(ids.region(), `地域${i}`),
        );
        await insertRegions(h, ...regions);
        const found = await findByIds(
          h,
          regions.map((r) => r.id),
        );
        expect(found).toHaveLength(100);
        expect(sortedIds(found)).toEqual(sortedIds(regions));
      });

      it("regionRepository#19 地域が保存されている / 101 件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const A = named(ids.region(), "谷中");
        await insertRegions(h, A);
        await expectBusinessRuleError(
          findByIds(h, [
            A.id,
            ...Array.from({ length: 100 }, () => ids.region()),
          ]),
          CommonErrorCode.InvalidInput,
        );
      });
    });

    describe("searchForOperation", () => {
      it("regionRepository#20 名称が「谷中」「谷中銀座」「東京谷中」「上野」の地域が保存されている / 「谷中」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        // Minted so id order is the reverse of the expected order: the
        // relevance, not the id, decides.
        const ueno = named(ids.region(), "上野");
        const tokyo = named(ids.region(), "東京谷中");
        const ginza = named(ids.region(), "谷中銀座");
        const yanaka = named(ids.region(), "谷中");
        await insertRegions(h, ueno, tokyo, ginza, yanaka);
        const result = await search(h, "谷中");
        expect(idsOf(result)).toEqual([yanaka.id, ginza.id, tokyo.id]);
        expect(result.count).toBe(3);
      });

      it("regionRepository#21 名称が「谷中銀座」「東京谷中」の地域が保存されている / 「谷中 銀座」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const ginza = named(ids.region(), "谷中銀座");
        const tokyo = named(ids.region(), "東京谷中");
        await insertRegions(h, ginza, tokyo);
        const result = await search(h, "谷中 銀座");
        expect(idsOf(result)).toEqual([ginza.id]);
        expect(result.count).toBe(1);
      });

      it("regionRepository#22 名称にキーワードを含む draft・published・unpublished・運営による非公開の地域が保存されている / searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const tick = ticker();
        const draft = named(ids.region(), "谷中の下書き");
        const published = publishedRegion(ids.region(), [ids.photo()], {
          name: "谷中の公開",
        });
        const unpublished = Region.unpublish(
          publishedRegion(ids.region(), [ids.photo()], {
            name: "谷中の取り下げ",
          }),
          tick(),
        ).entity;
        const suspended = Region.suspend(
          named(ids.region(), "谷中の非公開"),
          tick(),
        ).entity;
        const all = [draft, published, unpublished, suspended];
        await insertRegions(h, ...all);
        const result = await search(h, "谷中");
        expect(idsOf(result)).toEqual(all.map((r) => r.id));
        expect(result.items).toEqual(all);
        expect(result.count).toBe(4);
      });

      it("regionRepository#23 名称が「Yanaka Street」の地域が保存されている / 「yanaka」と「ＹＡＮＡＫＡ」でそれぞれ searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "Yanaka Street");
        await insertRegions(h, r);
        expect(idsOf(await search(h, "yanaka"))).toEqual([r.id]);
        expect(idsOf(await search(h, "ＹＡＮＡＫＡ"))).toEqual([r.id]);
      });

      it("regionRepository#24 名称が「Yanaka Street」の地域と、名称が「ＹＡＮＡＫＡ　ぎんざ」（全角の英字と全角の空白）の地域が保存されている / 「yanakastreet」と「yanaka ぎんざ」でそれぞれ searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const street = named(ids.region(), "Yanaka Street");
        const ginza = named(ids.region(), "ＹＡＮＡＫＡ　ぎんざ");
        await insertRegions(h, street, ginza);
        expect(idsOf(await search(h, "yanakastreet"))).toEqual([street.id]);
        expect(idsOf(await search(h, "yanaka ぎんざ"))).toEqual([ginza.id]);
      });

      it("regionRepository#25 名称が「ヤナカ」の地域が保存されている / 「ﾔﾅｶ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "ヤナカ");
        await insertRegions(h, r);
        expect(idsOf(await search(h, "ﾔﾅｶ"))).toEqual([r.id]);
      });

      it("regionRepository#26 名称が同じで ID の違う地域が2つ保存されている / その名称で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const first = named(ids.region(), "谷中");
        const second = named(ids.region(), "谷中");
        await insertRegions(h, second, first);
        expect(idsOf(await search(h, "谷中"))).toEqual([first.id, second.id]);
      });

      it("regionRepository#27 名称が「谷中」の地域と、名称に「谷中」を含まず、キャッチコピー・紹介・所在地のそれぞれにだけ「谷中」を含む地域が3つ保存されている / 「谷中」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const byAddress = named(ids.region(), "北の町", {
          address: SampleAddress.otemachi("谷中1-1"),
        });
        const byDescription = named(ids.region(), "西の町", {
          description: "谷中に近い",
        });
        const byTagline = named(ids.region(), "東の町", {
          tagline: "谷中の隣",
        });
        const byName = named(ids.region(), "谷中");
        await insertRegions(h, byAddress, byDescription, byTagline, byName);
        const result = await search(h, "谷中");
        expect(idsOf(result)).toEqual([
          byName.id,
          byAddress.id,
          byDescription.id,
          byTagline.id,
        ]);
        expect(result.count).toBe(4);
      });

      it("regionRepository#28 名称が null で、紹介に「谷中」を含む地域が保存されている / 「谷中」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), null, {
          description: "谷中の路地",
        });
        await insertRegions(h, r);
        expect(idsOf(await search(h, "谷中"))).toEqual([r.id]);
      });

      it("regionRepository#29 名称・キャッチコピー・紹介・所在地のどれにも「谷中」を含まない地域が保存されている / 「谷中」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        await insertRegions(
          h,
          named(regionIds().region(), "根津", {
            description: "坂の町",
            tagline: "坂を歩く",
          }),
        );
        expect(await search(h, "谷中")).toEqual({ items: [], count: 0 });
      });

      it("regionRepository#30 キーワードを含む名称の地域が保存されていない / searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        await insertRegions(h, named(regionIds().region(), "上野"));
        expect(await search(h, "谷中")).toEqual({ items: [], count: 0 });
      });

      const storeMatching = async (h: ConformanceHarness, n: number) => {
        const ids = regionIds();
        const regions = Array.from({ length: n }, (_, i) =>
          named(ids.region(), `谷中${i + 1}`),
        );
        await insertRegions(h, ...regions);
        return regions;
      };

      it("regionRepository#31 キーワードに合う地域が1件保存されている / page: 1、limit: 10 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const [r] = await storeMatching(h, 1);
        const result = await search(h, "谷中", { page: 1, limit: 10 });
        expect(idsOf(result)).toEqual([r?.id]);
        expect(result.count).toBe(1);
      });

      it("regionRepository#32 キーワードに合う地域が3件保存されている / page: 1、limit: 3 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const regions = await storeMatching(h, 3);
        const result = await search(h, "谷中", { page: 1, limit: 3 });
        expect(idsOf(result)).toEqual(regions.map((r) => r.id));
        expect(result.count).toBe(3);
      });

      it("regionRepository#33 キーワードに合う地域が5件保存されている / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const regions = await storeMatching(h, 5);
        const first = await search(h, "谷中", { page: 1, limit: 3 });
        const second = await search(h, "谷中", { page: 2, limit: 3 });
        expect([...idsOf(first), ...idsOf(second)]).toEqual(
          regions.map((r) => r.id),
        );
        expect(first.items).toHaveLength(3);
        expect(second.items).toHaveLength(2);
        expect(first.count).toBe(5);
        expect(second.count).toBe(5);
      });

      it("regionRepository#34 キーワードに合う地域が5件保存されている / page: 3、limit: 3 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        await storeMatching(h, 5);
        expect(await search(h, "谷中", { page: 3, limit: 3 })).toEqual({
          items: [],
          count: 5,
        });
      });

      it("regionRepository#35 名称が「谷中」の地域が保存されている / 名称を「根津」に替えて save し、「谷中」と「根津」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await insertRegions(h, r);
        await updateRegion(
          h,
          r.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({ name: "根津", description: null, tagline: null }),
              ticker()(),
            ).entity,
        );
        expect(await search(h, "谷中")).toEqual({ items: [], count: 0 });
        expect(idsOf(await search(h, "根津"))).toEqual([r.id]);
      });
    });

    describe("並行性", () => {
      it("regionRepository#36 地域が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、違う内容を同時に save する", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await insertRegions(h, r);
        const tick = ticker();
        const bothRead = barrier(2);
        const saved: Region[] = [];
        const attempt = (name: string) =>
          h.uow.run(async ({ regionRepository }) => {
            const read = await regionRepository.findById(r.id);
            if (read === null) throw new Error("region missing");
            await bothRead();
            const next = Region.updateContent(
              read.entity,
              regionContent({ name }),
              tick(),
            ).entity;
            saved.push(next);
            await regionRepository.save(next, read.expectedVersion);
            return next;
          });
        const results = await Promise.allSettled([
          attempt("根津"),
          attempt("千駄木"),
        ]);
        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<Region> => r.status === "fulfilled",
        );
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await getRegion(h, r.id)).entity).toEqual(fulfilled[0]?.value);
      });

      it("regionRepository#37 地域が保存されていない / 2つの UnitOfWork が、同じ ID の地域を同時に insert する", async () => {
        const h = await makeHarness();
        const id = regionIds().region();
        const bothRead = barrier(2);
        const attempt = (region: Region) =>
          h.uow.run(async ({ regionRepository }) => {
            expect(await regionRepository.findById(id)).toBeNull();
            await bothRead();
            await regionRepository.insert(region);
          });
        const a = named(id, "谷中");
        const b = named(id, "根津");
        const results = await Promise.allSettled([attempt(a), attempt(b)]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const winner = results[0]?.status === "fulfilled" ? a : b;
        expect((await getRegion(h, id)).entity).toEqual(winner);
        expect(await findByIds(h, [id])).toHaveLength(1);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("regionRepository#38 地域が保存されていない / UnitOfWork の中で insert してコミットし、直後に findById・findByIds・searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await insertRegions(h, r);
        expect((await getRegion(h, r.id)).entity).toEqual(r);
        expect(await findByIds(h, [r.id])).toEqual([r]);
        expect((await search(h, "谷中")).items).toEqual([r]);
      });

      it("regionRepository#39 地域が保存されている / UnitOfWork の中で save してコミットし、直後に findById・findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await insertRegions(h, r);
        const saved = await updateRegion(
          h,
          r.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({ name: "根津" }),
              ticker()(),
            ).entity,
        );
        expect((await getRegion(h, r.id)).entity).toEqual(saved);
        expect(await findByIds(h, [r.id])).toEqual([saved]);
      });

      it("regionRepository#40 地域が保存されていない / UnitOfWork の中で insert した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ regionRepository }) => {
            await regionRepository.insert(r);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findRegion(h, r.id)).toBeNull();
        expect(await findByIds(h, [r.id])).toEqual([]);
        expect(await search(h, "谷中")).toEqual({ items: [], count: 0 });
      });

      it("regionRepository#41 地域が保存されている / UnitOfWork の中で save した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const r = named(regionIds().region(), "谷中");
        await insertRegions(h, r);
        const read = await getRegion(h, r.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ regionRepository }) => {
            await regionRepository.save(
              Region.updateContent(
                read.entity,
                regionContent({ name: "根津" }),
                ticker()(),
              ).entity,
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getRegion(h, r.id);
        expect(after.entity).toEqual(r);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });

      it("regionRepository#42 地域 A と地域 B が保存されている / 1つの UnitOfWork の中で、A を save し、B と同じ ID の地域を insert する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const A = named(ids.region(), "谷中");
        const B = named(ids.region(), "根津");
        await insertRegions(h, A, B);
        const readA = await getRegion(h, A.id);
        await expect(
          h.uow.run(async ({ regionRepository }) => {
            await regionRepository.save(
              Region.updateContent(
                readA.entity,
                regionContent({ name: "千駄木" }),
                ticker()(),
              ).entity,
              readA.expectedVersion,
            );
            await regionRepository.insert(named(B.id, "上野"));
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegion(h, A.id)).entity).toEqual(A);
        expect((await getRegion(h, B.id)).entity).toEqual(B);
      });
    });
  });
}
