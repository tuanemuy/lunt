import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import {
  PlaceMatchCriteria,
  PlaceMatching,
} from "@repo/core/domain/place/matching";
import { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { ScopeAbort } from "./fixtures";
import type { HarnessFactory } from "./harness";
import {
  ALL_PAGE,
  findPlace,
  getPlace,
  insertPlaces,
  insertSamplePlaces,
  type MatchQuery,
  matchPlaces,
  newPlace,
  PLACE_T0,
  placeIds,
  placeProfile,
  savePlace,
  suspended,
  updatePlace,
} from "./placeFixtures";

const LATER = new Date("2026-09-02T00:00:00.000Z");

const idsOf = (result: Readonly<{ items: readonly Place[] }>) =>
  result.items.map((place) => place.id);

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected a rejection");
    },
    (error: unknown) => error,
  );
}

/** `spec/testcases/ports/placeRepository.md`. */
export function describePlaceRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("PlaceRepository contract", () => {
    describe("メソッドの基本動作", () => {
      it("placeRepository#1 店舗がない / p1 を insert し、findById(p1) を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place(), {
          photoIds: [ids.photo(), ids.photo()],
          description: "紹介",
          businessHours: "10:00-18:00",
          contact: "03-0000-0000",
        });
        await insertPlaces(h, p1);
        const found = await getPlace(h, p1.id);
        expect(found.entity).toEqual(p1);
        await savePlace(
          h,
          Place.changeOperatingStatus(found.entity, "temporarilyClosed", LATER)
            .entity,
          found.expectedVersion,
        );
        expect((await getPlace(h, p1.id)).entity.operatingStatus).toBe(
          "temporarilyClosed",
        );
      });

      it("placeRepository#2 店舗がない / findById(p1)", async () => {
        const h = await makeHarness();
        expect(await findPlace(h, placeIds().place())).toBeNull();
      });

      it("placeRepository#3 p1 がある / 同じ ID の店舗（内容は別）を insert する", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        const error = await rejection(
          insertPlaces(h, newPlace(p1.id, { name: "別の店" })),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect((await getPlace(h, p1.id)).entity).toEqual(p1);
      });

      it("placeRepository#4 p1 がある / p1 と同じ名称・同じ所在地で、ID が p2 の店舗を insert する", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place());
        await insertPlaces(h, p1);
        await insertPlaces(h, p2);
        expect((await getPlace(h, p1.id)).entity).toEqual(p1);
        expect((await getPlace(h, p2.id)).entity).toEqual(p2);
      });

      it("placeRepository#5 p1 がある / findById(p1) の expectedVersion で、名称と写真の並びを変えた内容を save し、findById(p1) を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const [a, b, c] = [ids.photo(), ids.photo(), ids.photo()];
        const p1 = newPlace(ids.place(), { photoIds: [a, b] });
        await insertPlaces(h, p1);
        const changed = await updatePlace(
          h,
          p1.id,
          (place) =>
            Place.updateProfile(
              place,
              placeProfile({ name: "川辺食堂", photoIds: [c, b, a] }),
              LATER,
            ).entity,
        );
        const found = await getPlace(h, p1.id);
        expect(found.entity).toEqual(changed);
        expect(
          found.entity.profile.photos.items.map((photo) => photo.photoId),
        ).toEqual([c, b, a]);
        await savePlace(
          h,
          Place.suspend(found.entity, LATER).entity,
          found.expectedVersion,
        );
        expect(Place.isSuspended((await getPlace(h, p1.id)).entity)).toBe(true);
      });

      it("placeRepository#6 p1 が写真を2枚持つ / findById(p1) の expectedVersion で、takeDownPhotos で1枚を外した内容を save し、findById(p1) を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const [a, b] = [ids.photo(), ids.photo()];
        const p1 = newPlace(ids.place(), { photoIds: [a, b] });
        await insertPlaces(h, p1);
        const changed = await updatePlace(
          h,
          p1.id,
          (place) => Place.takeDownPhotos(place, [a], LATER).entity,
        );
        const found = (await getPlace(h, p1.id)).entity;
        expect(found).toEqual(changed);
        expect(found.profile.photos.items).toEqual([{ photoId: b }]);
        expect(found.profile.photos.takenDown).toBe(true);
      });

      it("placeRepository#7 p1 がある / findById(p1) の expectedVersion で、非公開にした内容を save し、findById(p1) を呼ぶ", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        const changed = await updatePlace(h, p1.id, suspended);
        const found = (await getPlace(h, p1.id)).entity;
        expect(found).toEqual(changed);
        expect(found.suspension).toEqual({ suspended: true });
      });

      it("placeRepository#8 店舗がない / 保存されていない p1 を save する", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        const error = await rejection(
          h.uow.run(({ placeRepository }) =>
            placeRepository.save(p1, 0 as Parameters<typeof savePlace>[2]),
          ),
        );
        expect(error).toBeInstanceOf(NotFoundError);
      });

      it("placeRepository#9 p1、p2（p2 は非公開）がある / findByIds([p2, p1, p9])（p9 は存在しない）", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = suspended(newPlace(ids.place(), { name: "二号店" }));
        const p9 = ids.place();
        await insertPlaces(h, p1, p2);
        const found = await h.uow.run(({ placeRepository }) =>
          placeRepository.findByIds([p2.id, p1.id, p9]),
        );
        expect([...found].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual([
          p1,
          p2,
        ]);
      });

      it("placeRepository#10 p1 がある / findByIds([])", async () => {
        const h = await makeHarness();
        await insertPlaces(h, newPlace(placeIds().place()));
        expect(
          await h.uow.run(({ placeRepository }) =>
            placeRepository.findByIds([]),
          ),
        ).toEqual([]);
      });

      it("placeRepository#11 100件の店舗がある / 100件の ID を渡して findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const places = Array.from({ length: 100 }, (_, i) =>
          newPlace(ids.place(), { name: `店舗${i}` }),
        );
        await insertPlaces(h, ...places);
        const found = await h.uow.run(({ placeRepository }) =>
          placeRepository.findByIds(places.map((place) => place.id)),
        );
        expect(new Set(found.map((place) => place.id))).toEqual(
          new Set(places.map((place) => place.id)),
        );
      });

      it("placeRepository#12 店舗がある / 101件の ID を渡して findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        await insertPlaces(h, p1);
        await expectBusinessRuleError(
          h.uow.run(({ placeRepository }) =>
            placeRepository.findByIds([
              p1.id,
              ...Array.from({ length: 100 }, () => ids.place()),
            ]),
          ),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("並行性", () => {
      it("placeRepository#13 p1 がある。findById(p1) を2回呼び、同じ版の expectedVersion を2つ持つ / 1つ目の expectedVersion で店舗情報を変えて save し、続けて2つ目の expectedVersion で営業状況を変えて save する", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        const first = await getPlace(h, p1.id);
        const second = await getPlace(h, p1.id);
        const renamed = Place.updateProfile(
          first.entity,
          placeProfile({ name: "川辺食堂" }),
          LATER,
        ).entity;
        await savePlace(h, renamed, first.expectedVersion);
        const error = await rejection(
          savePlace(
            h,
            Place.changeOperatingStatus(
              second.entity,
              "permanentlyClosed",
              LATER,
            ).entity,
            second.expectedVersion,
          ),
        );
        expect(error).toBeInstanceOf(ConflictError);
        const found = (await getPlace(h, p1.id)).entity;
        expect(found).toEqual(renamed);
        expect(found.operatingStatus).toBe("open");
      });

      it("placeRepository#14 p1 がある。同じ版の expectedVersion を2つ持つ / 非公開にする save と、写真を削除する save を同時に行う", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const photo = ids.photo();
        const p1 = newPlace(ids.place(), { photoIds: [photo, ids.photo()] });
        await insertPlaces(h, p1);
        const read = await getPlace(h, p1.id);
        const outcomes = await Promise.allSettled([
          savePlace(h, suspended(read.entity), read.expectedVersion),
          savePlace(
            h,
            Place.takeDownPhotos(read.entity, [photo], LATER).entity,
            read.expectedVersion,
          ),
        ]);
        const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
        const rejected = outcomes.filter(
          (o): o is PromiseRejectedResult => o.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const found = (await getPlace(h, p1.id)).entity;
        expect(
          Place.isSuspended(found) !== found.profile.photos.takenDown,
        ).toBe(true);
      });
    });

    describe("照合（match）", () => {
      type Case = Readonly<{
        query: MatchQuery;
        pagination?: Pagination;
        /** Indexes into p1 … p6 (0-based) in the expected order. */
        expected: readonly number[];
        count: number;
      }>;

      const scenario = (c: Case) => async () => {
        const h = await makeHarness();
        const places = await insertSamplePlaces(h);
        const result = await matchPlaces(
          h,
          c.query,
          c.pagination ?? { page: 1, limit: 10 },
        );
        expect(idsOf(result)).toEqual(c.expected.map((i) => places[i]));
        expect(result.count).toBe(c.count);
      };

      it(
        "placeRepository#15 テスト用の店舗 / 店名「山田」、includeSuspended: false、page: 1、limit: 10",
        scenario({
          query: { name: "山田", includeSuspended: false },
          expected: [0, 1, 2],
          count: 3,
        }),
      );

      it(
        "placeRepository#16 テスト用の店舗 / 店名「山田」、includeSuspended: true、page: 1、limit: 10",
        scenario({
          query: { name: "山田", includeSuspended: true },
          expected: [3, 0, 1, 2],
          count: 4,
        }),
      );

      it(
        "placeRepository#17 テスト用の店舗 / 店名「山田珈琲店」、includeSuspended: true",
        scenario({
          query: { name: "山田珈琲店", includeSuspended: true },
          expected: [0, 1, 2, 3],
          count: 4,
        }),
      );

      it(
        "placeRepository#18 テスト用の店舗 / 店名「山田珈琲店 本店」（正規化した値は 山田珈琲店本店）、includeSuspended: true",
        scenario({
          query: { name: "山田珈琲店 本店", includeSuspended: true },
          expected: [0, 3],
          count: 2,
        }),
      );

      it(
        "placeRepository#19 テスト用の店舗 / 住所「東京都千代田区」、includeSuspended: false",
        scenario({
          query: { address: "東京都千代田区", includeSuspended: false },
          expected: [0, 4],
          count: 2,
        }),
      );

      it(
        "placeRepository#20 テスト用の店舗 / 住所「東京都千代田区大手町1-1」、includeSuspended: false",
        scenario({
          query: {
            address: "東京都千代田区大手町1-1",
            includeSuspended: false,
          },
          expected: [0],
          count: 1,
        }),
      );

      it(
        "placeRepository#21 テスト用の店舗 / 住所「銀座」、includeSuspended: false",
        scenario({
          query: { address: "銀座", includeSuspended: false },
          expected: [1, 5],
          count: 2,
        }),
      );

      it(
        "placeRepository#22 テスト用の店舗 / 店名「山田珈琲店」と住所「東京都千代田区」、includeSuspended: false",
        scenario({
          query: {
            name: "山田珈琲店",
            address: "東京都千代田区",
            includeSuspended: false,
          },
          expected: [0, 1, 4, 2],
          count: 4,
        }),
      );

      it(
        "placeRepository#23 テスト用の店舗 / 店名「ＹＡＭＡＤＡ　ｃｏｆｆｅｅ」から作った語（正規化した値は yamadacoffee）、includeSuspended: false",
        scenario({
          query: {
            name: "ＹＡＭＡＤＡ　ｃｏｆｆｅｅ",
            includeSuspended: false,
          },
          expected: [5],
          count: 1,
        }),
      );

      it(
        "placeRepository#24 テスト用の店舗 / 同じ語「梅田」を店名と住所の両方に入れる、includeSuspended: true",
        scenario({
          query: { name: "梅田", address: "梅田", includeSuspended: true },
          expected: [2, 3],
          count: 2,
        }),
      );

      it("placeRepository#25 テスト用の店舗 / 上の各ケースの結果", async () => {
        const h = await makeHarness();
        await insertSamplePlaces(h);
        const queries: readonly MatchQuery[] = [
          { name: "山田", includeSuspended: false },
          { name: "山田", includeSuspended: true },
          { name: "山田珈琲店", includeSuspended: true },
          { name: "山田珈琲店 本店", includeSuspended: true },
          { address: "東京都千代田区", includeSuspended: false },
          { address: "東京都千代田区大手町1-1", includeSuspended: false },
          { address: "銀座", includeSuspended: false },
          {
            name: "山田珈琲店",
            address: "東京都千代田区",
            includeSuspended: false,
          },
          { name: "ＹＡＭＡＤＡ　ｃｏｆｆｅｅ", includeSuspended: false },
          { name: "梅田", address: "梅田", includeSuspended: true },
        ];
        for (const query of queries) {
          const criteria = PlaceMatchCriteria.create({
            name: query.name ?? null,
            address: query.address ?? null,
            includeSuspended: query.includeSuspended,
          });
          const { items } = await matchPlaces(h, query, ALL_PAGE);
          for (const place of items) {
            expect(PlaceMatching.matches(place, criteria)).toBe(true);
          }
          const expected = [...items].sort(
            (a, b) =>
              PlaceMatching.relevance(b, criteria) -
                PlaceMatching.relevance(a, criteria) ||
              (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          );
          expect(idsOf({ items })).toEqual(idsOf({ items: expected }));
        }
      });

      it(
        "placeRepository#26 テスト用の店舗 / 店名「存在しない店」、includeSuspended: true",
        scenario({
          query: { name: "存在しない店", includeSuspended: true },
          expected: [],
          count: 0,
        }),
      );

      it(
        "placeRepository#27 テスト用の店舗 / 店名「海の家」、includeSuspended: false、page: 1、limit: 10",
        scenario({
          query: { name: "海の家", includeSuspended: false },
          expected: [4],
          count: 1,
        }),
      );

      it(
        "placeRepository#28 テスト用の店舗 / 店名「山田」、includeSuspended: true、page: 1、limit: 4（件数が上限ちょうど）",
        scenario({
          query: { name: "山田", includeSuspended: true },
          pagination: { page: 1, limit: 4 },
          expected: [3, 0, 1, 2],
          count: 4,
        }),
      );

      it(
        "placeRepository#29 テスト用の店舗 / 店名「山田」、includeSuspended: true、page: 1、limit: 3（件数が上限を超える）",
        scenario({
          query: { name: "山田", includeSuspended: true },
          pagination: { page: 1, limit: 3 },
          expected: [3, 0, 1],
          count: 4,
        }),
      );

      it(
        "placeRepository#30 テスト用の店舗 / 店名「山田」、includeSuspended: true、page: 2、limit: 3",
        scenario({
          query: { name: "山田", includeSuspended: true },
          pagination: { page: 2, limit: 3 },
          expected: [2],
          count: 4,
        }),
      );

      it(
        "placeRepository#31 テスト用の店舗 / 店名「山田」、includeSuspended: true、page: 3、limit: 3（範囲の外の page）",
        scenario({
          query: { name: "山田", includeSuspended: true },
          pagination: { page: 3, limit: 3 },
          expected: [],
          count: 4,
        }),
      );
    });

    describe("可視性", () => {
      it("placeRepository#32 店舗がない / p1 を insert した直後に、findById(p1)、findByIds([p1])、店名「山田珈琲店」の match を呼ぶ", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        expect((await getPlace(h, p1.id)).entity).toEqual(p1);
        expect(
          await h.uow.run(({ placeRepository }) =>
            placeRepository.findByIds([p1.id]),
          ),
        ).toEqual([p1]);
        expect(
          idsOf(
            await matchPlaces(h, {
              name: "山田珈琲店",
              includeSuspended: false,
            }),
          ),
        ).toEqual([p1.id]);
      });

      it("placeRepository#33 p1 がある / 名称を「川辺食堂」に変えて save した直後に、店名「山田珈琲店」と店名「川辺食堂」の match を呼ぶ", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        await updatePlace(
          h,
          p1.id,
          (place) =>
            Place.updateProfile(
              place,
              placeProfile({ name: "川辺食堂" }),
              LATER,
            ).entity,
        );
        expect(
          idsOf(
            await matchPlaces(h, {
              name: "山田珈琲店",
              includeSuspended: true,
            }),
          ),
        ).toEqual([]);
        expect(
          idsOf(
            await matchPlaces(h, { name: "川辺食堂", includeSuspended: true }),
          ),
        ).toEqual([p1.id]);
      });

      it("placeRepository#34 p1 がある / 非公開にした内容を save した直後に、店名「山田珈琲店」の match を includeSuspended: false と true で呼ぶ", async () => {
        const h = await makeHarness();
        const p1 = newPlace(placeIds().place());
        await insertPlaces(h, p1);
        await updatePlace(h, p1.id, suspended);
        expect(
          idsOf(
            await matchPlaces(h, {
              name: "山田珈琲店",
              includeSuspended: false,
            }),
          ),
        ).toEqual([]);
        expect(
          idsOf(
            await matchPlaces(h, {
              name: "山田珈琲店",
              includeSuspended: true,
            }),
          ),
        ).toEqual([p1.id]);
      });
    });

    describe("UnitOfWork の中での振る舞い", () => {
      const both = (p1: PlaceId, p2: PlaceId) => [p1, p2];

      it("placeRepository#35 店舗がない / UnitOfWork の中で p1 と p2 を insert し、fn が値を返す", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place(), { address: SampleAddress.ginza() });
        const value = await h.uow.run(async ({ placeRepository }) => {
          await placeRepository.insert(p1);
          await placeRepository.insert(p2);
          return "done";
        });
        expect(value).toBe("done");
        const found = await h.uow.run(({ placeRepository }) =>
          placeRepository.findByIds(both(p1.id, p2.id)),
        );
        expect(found).toHaveLength(2);
        expect(
          idsOf(
            await matchPlaces(h, {
              name: "山田珈琲店",
              includeSuspended: false,
            }),
          ),
        ).toEqual([p1.id, p2.id]);
      });

      it("placeRepository#36 店舗がない / UnitOfWork の中で p1 と p2 を insert し、その後に fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place());
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(p1);
            await placeRepository.insert(p2);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findPlace(h, p1.id)).toBeNull();
        expect(await findPlace(h, p2.id)).toBeNull();
        expect(
          (await matchPlaces(h, { name: "山田珈琲店", includeSuspended: true }))
            .count,
        ).toBe(0);
      });

      it("placeRepository#37 p1 がある / UnitOfWork の中で、p1 の名称を変えて save し、p2 を insert し、その後に fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place());
        await insertPlaces(h, p1);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ placeRepository }) => {
            const read = await placeRepository.findById(p1.id);
            if (read === null) throw new Error("p1 missing");
            await placeRepository.save(
              Place.updateProfile(
                read.entity,
                placeProfile({ name: "川辺食堂" }),
                LATER,
              ).entity,
              read.expectedVersion,
            );
            await placeRepository.insert(p2);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await getPlace(h, p1.id)).entity).toEqual(p1);
        expect(await findPlace(h, p2.id)).toBeNull();
      });

      it("placeRepository#38 p1 がある / UnitOfWork の中で、p2 を insert し、同じ ID の p1 を insert する", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place());
        await insertPlaces(h, p1);
        const error = await rejection(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(p2);
            await placeRepository.insert(newPlace(p1.id, { name: "別の店" }));
          }),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect(await findPlace(h, p2.id)).toBeNull();
        expect((await getPlace(h, p1.id)).entity).toEqual(p1);
      });

      it("placeRepository#39 p1 がある。先の UnitOfWork で findById(p1) の expectedVersion を得た後、別の UnitOfWork の save が p1 を更新している / 新しい UnitOfWork の中で、p2 を insert し、古い expectedVersion で p1 を save する", async () => {
        const h = await makeHarness();
        const ids = placeIds();
        const p1 = newPlace(ids.place());
        const p2 = newPlace(ids.place());
        await insertPlaces(h, p1);
        const stale = await getPlace(h, p1.id);
        const renamed = await updatePlace(
          h,
          p1.id,
          (place) =>
            Place.updateProfile(
              place,
              placeProfile({ name: "川辺食堂" }),
              LATER,
            ).entity,
        );
        const error = await rejection(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(p2);
            await placeRepository.save(
              Place.changeOperatingStatus(
                stale.entity,
                "permanentlyClosed",
                PLACE_T0,
              ).entity,
              stale.expectedVersion,
            );
          }),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect(await findPlace(h, p2.id)).toBeNull();
        expect((await getPlace(h, p1.id)).entity).toEqual(renamed);
      });
    });
  });
}
