import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { describe, expect, it } from "vitest";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  findRegionLink,
  getRegionLink,
  insertRegionLinks,
  type OccasionFactory,
  occasionFactory,
  page,
} from "./occasionFixtures";

type H = ConformanceHarness;

const byOccasion = (h: H, id: OccasionId, pagination: Pagination = page(1)) =>
  h.uow.run(({ regionLinkRepository }) =>
    regionLinkRepository.findByOccasion(id, pagination),
  );

const byRegion = (h: H, id: RegionId, pagination: Pagination = page(1)) =>
  h.uow.run(({ regionLinkRepository }) =>
    regionLinkRepository.findByRegion(id, pagination),
  );

const save = (
  h: H,
  link: RegionLink,
  expectedVersion: ExpectedVersion<RegionLink>,
) =>
  h.uow.run(({ regionLinkRepository }) =>
    regionLinkRepository.save(link, expectedVersion),
  );

const remove = (
  h: H,
  link: RegionLink,
  expectedVersion: ExpectedVersion<RegionLink>,
) =>
  h.uow.run(({ regionLinkRepository }) =>
    regionLinkRepository.delete(link.key, expectedVersion),
  );

const regions = (items: readonly RegionLink[]): readonly RegionId[] =>
  items.map((link) => link.key.regionId);

const occasions = (items: readonly RegionLink[]): readonly OccasionId[] =>
  items.map((link) => link.key.occasionId);

const detach = (f: OccasionFactory, link: RegionLink): RegionLink =>
  RegionLink.detach(link, f.tick()).entity;

/** `count` links of one occasion, each linked after the one before. */
const ofOccasion = (
  f: OccasionFactory,
  occasionId: OccasionId,
  count: number,
) => Array.from({ length: count }, () => f.regionLink(occasionId, f.region()));

const ofRegion = (f: OccasionFactory, regionId: RegionId, count: number) =>
  Array.from({ length: count }, () => f.regionLink(f.occasionId(), regionId));

/** `spec/testcases/ports/regionLinkRepository.md`. */
export function describeRegionLinkRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("RegionLinkRepository contract", () => {
    describe("insert・findById・save・delete", () => {
      it("regionLinkRepository#1 関連づけがない / イベント O と地域 R の組の linked の関連づけを insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const read = await getRegionLink(h, link.key);
        expect(read.entity).toEqual(link);
        expect(read.entity.status).toBe("linked");
        expect(read.expectedVersion).toBe(link.version);
      });

      it("regionLinkRepository#2 イベント O と地域 R の組の linked の関連づけがある / 同じ組の関連づけを insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        await expect(
          insertRegionLinks(
            h,
            f.regionLink(link.key.occasionId, link.key.regionId),
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegionLink(h, link.key)).entity).toEqual(link);
      });

      it("regionLinkRepository#3 イベント O と地域 R の組の detached の関連づけがある / 同じ組の linked の関連づけを insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const detached = f.detached(f.regionLink(f.occasionId(), f.region()));
        await insertRegionLinks(h, detached);
        await expect(
          insertRegionLinks(
            h,
            f.regionLink(detached.key.occasionId, detached.key.regionId),
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegionLink(h, detached.key)).entity.status).toBe(
          "detached",
        );
      });

      it("regionLinkRepository#4 イベント O と地域 R の組の関連づけがある / イベント O と地域 S の組、イベント N と地域 R の組の関連づけを insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n, r, s] = [
          f.occasionId(),
          f.occasionId(),
          f.region(),
          f.region(),
        ];
        await insertRegionLinks(h, f.regionLink(o, r));
        const os = f.regionLink(o, s);
        const nr = f.regionLink(n, r);
        await insertRegionLinks(h, os, nr);
        expect((await getRegionLink(h, os.key)).entity).toEqual(os);
        expect((await getRegionLink(h, nr.key)).entity).toEqual(nr);
      });

      it("regionLinkRepository#5 イベント O と地域 R の組に関連づけがない。2つの要求が同時に同じ組の関連づけを insert する / 両方をコミットする", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, r] = [f.occasionId(), f.region()];
        const a = f.regionLink(o, r);
        const b = f.regionLink(o, r);
        const results = await Promise.allSettled([
          insertRegionLinks(h, a),
          insertRegionLinks(h, b),
        ]);
        const rejected = results.filter((x) => x.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
        expect((await byOccasion(h, o)).count).toBe(1);
      });

      it("regionLinkRepository#6 関連づけがない / 関連づけのない組で findById を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        expect(
          await findRegionLink(h, {
            occasionId: f.occasionId(),
            regionId: f.region(),
          }),
        ).toBeNull();
      });

      it("regionLinkRepository#7 イベント O と地域 R の組の linked の関連づけがある / findById が返した expectedVersion を使って、detached にした関連づけを save し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const read = await getRegionLink(h, link.key);
        const next = detach(f, read.entity);
        await save(h, next, read.expectedVersion);
        const after = (await getRegionLink(h, link.key)).entity;
        expect(after).toEqual(next);
        expect(after.status).toBe("detached");
        expect(after.linkedAt).toEqual(link.linkedAt);
        expect(after.version).toBe(link.version + 1);
      });

      it("regionLinkRepository#8 イベント O と地域 R の組の detached の関連づけがある / linked に戻した関連づけを save し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const detached = f.detached(f.regionLink(f.occasionId(), f.region()));
        await insertRegionLinks(h, detached);
        const read = await getRegionLink(h, detached.key);
        const restored = RegionLink.restore(read.entity, f.tick()).entity;
        await save(h, restored, read.expectedVersion);
        const after = (await getRegionLink(h, detached.key)).entity;
        expect(after.status).toBe("linked");
        expect(after.linkedAt).toEqual(detached.linkedAt);
      });

      it("regionLinkRepository#9 2つの要求が、同じ linked の関連づけを同じ expectedVersion で読んでいる / 先に delete（関連づけを外す）を確定し、後から detached にして save（解除）する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const first = await getRegionLink(h, link.key);
        const second = await getRegionLink(h, link.key);
        await remove(h, link, first.expectedVersion);
        await expect(
          save(h, detach(f, second.entity), second.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await findRegionLink(h, link.key)).toBeNull();
      });

      it("regionLinkRepository#10 2つの要求が、同じ linked の関連づけを同じ expectedVersion で読んでいる / 先に detached にして save（解除）を確定し、後から delete（関連づけを外す）する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const first = await getRegionLink(h, link.key);
        const second = await getRegionLink(h, link.key);
        await save(h, detach(f, first.entity), first.expectedVersion);
        await expect(
          remove(h, link, second.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegionLink(h, link.key)).entity.status).toBe(
          "detached",
        );
      });

      it("regionLinkRepository#11 関連づけを findById で読んだ後に、別の save が成立して版が進んでいる / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const read = await getRegionLink(h, link.key);
        const detached = detach(f, read.entity);
        await save(h, detached, read.expectedVersion);
        await expect(
          save(h, detach(f, read.entity), read.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getRegionLink(h, link.key)).entity).toEqual(detached);
      });

      it("regionLinkRepository#12 関連づけがない / 関連づけのない組の関連づけを save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await expect(
          save(
            h,
            f.regionLink(f.occasionId(), f.region()),
            0 as ExpectedVersion<RegionLink>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("regionLinkRepository#13 イベント O と地域 R の組の linked の関連づけがある / findById が返した expectedVersion で delete し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        await remove(
          h,
          link,
          (await getRegionLink(h, link.key)).expectedVersion,
        );
        expect(await findRegionLink(h, link.key)).toBeNull();
        expect((await byOccasion(h, link.key.occasionId)).items).toEqual([]);
        expect((await byRegion(h, link.key.regionId)).items).toEqual([]);
      });

      it("regionLinkRepository#14 関連づけを delete した後 / 同じ組の関連づけを、新しい linkedAt で insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        await remove(
          h,
          link,
          (await getRegionLink(h, link.key)).expectedVersion,
        );
        const again = f.regionLink(link.key.occasionId, link.key.regionId);
        await insertRegionLinks(h, again);
        expect((await getRegionLink(h, link.key)).entity).toEqual(again);
      });

      it("regionLinkRepository#15 関連づけを findById で読んだ後に、別の save が成立して版が進んでいる / 古い expectedVersion で delete する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const read = await getRegionLink(h, link.key);
        await save(h, detach(f, read.entity), read.expectedVersion);
        await expect(
          remove(h, link, read.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findRegionLink(h, link.key)).not.toBeNull();
      });

      it("regionLinkRepository#16 関連づけがない / 関連づけのない組を delete する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await expect(
          remove(
            h,
            f.regionLink(f.occasionId(), f.region()),
            0 as ExpectedVersion<RegionLink>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findByOccasion", () => {
      it("regionLinkRepository#17 イベント O に、地域 R（linkedAt が古い。linked）、地域 S（新しい。detached）の関連づけがある。イベント N に地域 T の関連づけがある / イベント O で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n] = [f.occasionId(), f.occasionId()];
        const r = f.regionLink(o, f.region());
        const s = f.detached(f.regionLink(o, f.region()));
        const t = f.regionLink(n, f.region());
        await insertRegionLinks(h, s, t, r);
        const result = await byOccasion(h, o);
        expect(result.items).toEqual([r, s]);
        expect(result.count).toBe(2);
      });

      it("regionLinkRepository#18 イベント O に、同じ linkedAt の地域 A・B（RegionId は A < B）の関連づけがある / イベント O で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const [a, b] = [f.region(), f.region()];
        const at = f.tick();
        await insertRegionLinks(
          h,
          f.regionLink(o, b, at),
          f.regionLink(o, a, at),
        );
        expect(regions((await byOccasion(h, o)).items)).toEqual([a, b]);
      });

      it("regionLinkRepository#19 イベント O に関連づけがない / page: 1 で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertRegionLinks(h, f.regionLink(f.occasionId(), f.region()));
        expect(await byOccasion(h, f.occasionId(), page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("regionLinkRepository#20 イベント O に関連づけが1件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const only = f.regionLink(o, f.region());
        await insertRegionLinks(h, only);
        expect(await byOccasion(h, o, page(1, 10))).toEqual({
          items: [only],
          count: 1,
        });
      });

      it("regionLinkRepository#21 イベント O に関連づけが10件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const all = ofOccasion(f, o, 10);
        await insertRegionLinks(h, ...all);
        expect(await byOccasion(h, o, page(1, 10))).toEqual({
          items: all,
          count: 10,
        });
        expect(await byOccasion(h, o, page(2, 10))).toEqual({
          items: [],
          count: 10,
        });
      });

      it("regionLinkRepository#22 イベント O に関連づけが11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const all = ofOccasion(f, o, 11);
        await insertRegionLinks(h, ...all);
        const first = await byOccasion(h, o, page(1, 10));
        const second = await byOccasion(h, o, page(2, 10));
        expect(first.items).toEqual(all.slice(0, 10));
        expect(second.items).toEqual(all.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });

      it("regionLinkRepository#23 イベント O に関連づけが11件ある / page: 3、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        await insertRegionLinks(h, ...ofOccasion(f, o, 11));
        expect(await byOccasion(h, o, page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("findByRegion", () => {
      it("regionLinkRepository#24 地域 R に、イベント M（linkedAt が古い。linked）、イベント N（新しい。detached）の関連づけがある。地域 S にイベント M の関連づけがある / 地域 R で findByRegion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [r, s] = [f.region(), f.region()];
        const [m, n] = [f.occasionId(), f.occasionId()];
        const mr = f.regionLink(m, r);
        const nr = f.detached(f.regionLink(n, r));
        const ms = f.regionLink(m, s);
        await insertRegionLinks(h, mr, ms, nr);
        const result = await byRegion(h, r);
        expect(result.items).toEqual([nr, mr]);
        expect(result.count).toBe(2);
      });

      it("regionLinkRepository#25 地域 R のイベント N との関連づけを detached から linked に戻して save した / 地域 R で findByRegion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        const mr = f.detached(f.regionLink(f.occasionId(), r));
        const nr = f.detached(f.regionLink(f.occasionId(), r));
        await insertRegionLinks(h, mr, nr);
        const read = await getRegionLink(h, nr.key);
        const restored = RegionLink.restore(read.entity, f.tick()).entity;
        await save(h, restored, read.expectedVersion);
        const readM = await getRegionLink(h, mr.key);
        const restoredM = RegionLink.restore(readM.entity, f.tick()).entity;
        await save(h, restoredM, readM.expectedVersion);
        const result = await byRegion(h, r);
        expect(result.items).toEqual([restored, restoredM]);
        expect(result.items[0]?.status).toBe("linked");
      });

      it("regionLinkRepository#26 地域 R に、同じ linkedAt のイベント A・B（OccasionId は A < B）の関連づけがある / 地域 R で findByRegion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        const [a, b] = [f.occasionId(), f.occasionId()];
        const at = f.tick();
        await insertRegionLinks(
          h,
          f.regionLink(b, r, at),
          f.regionLink(a, r, at),
        );
        expect(occasions((await byRegion(h, r)).items)).toEqual([a, b]);
      });

      it("regionLinkRepository#27 地域 R に関連づけがない / page: 1 で findByRegion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertRegionLinks(h, f.regionLink(f.occasionId(), f.region()));
        expect(await byRegion(h, f.region(), page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("regionLinkRepository#28 地域 R に関連づけが1件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        const only = f.regionLink(f.occasionId(), r);
        await insertRegionLinks(h, only);
        expect(await byRegion(h, r, page(1, 10))).toEqual({
          items: [only],
          count: 1,
        });
      });

      it("regionLinkRepository#29 地域 R に関連づけが10件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        const all = ofRegion(f, r, 10);
        await insertRegionLinks(h, ...all);
        expect(await byRegion(h, r, page(1, 10))).toEqual({
          items: [...all].reverse(),
          count: 10,
        });
        expect(await byRegion(h, r, page(2, 10))).toEqual({
          items: [],
          count: 10,
        });
      });

      it("regionLinkRepository#30 地域 R に関連づけが11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        const all = ofRegion(f, r, 11);
        await insertRegionLinks(h, ...all);
        const ordered = [...all].reverse();
        const first = await byRegion(h, r, page(1, 10));
        const second = await byRegion(h, r, page(2, 10));
        expect(first.items).toEqual(ordered.slice(0, 10));
        expect(second.items).toEqual(ordered.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });

      it("regionLinkRepository#31 地域 R に関連づけが11件ある / page: 3、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const r = f.region();
        await insertRegionLinks(h, ...ofRegion(f, r, 11));
        expect(await byRegion(h, r, page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("regionLinkRepository#32 関連づけがない / UnitOfWork の中で関連づけを insert してコミットし、直後に findById・findByOccasion・findByRegion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await h.uow.run(({ regionLinkRepository }) =>
          regionLinkRepository.insert(link),
        );
        expect((await getRegionLink(h, link.key)).entity).toEqual(link);
        expect((await byOccasion(h, link.key.occasionId)).items).toEqual([
          link,
        ]);
        expect((await byRegion(h, link.key.regionId)).items).toEqual([link]);
      });

      it("regionLinkRepository#33 linked の関連づけがある / UnitOfWork の中で detached にして save してコミットし、直後に findByRegion と findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const detached = await h.uow.run(async ({ regionLinkRepository }) => {
          const read = await regionLinkRepository.findById(link.key);
          if (read === null) throw new Error("no link");
          const next = detach(f, read.entity);
          await regionLinkRepository.save(next, read.expectedVersion);
          return next;
        });
        expect((await byRegion(h, link.key.regionId)).items).toEqual([
          detached,
        ]);
        expect((await byOccasion(h, link.key.occasionId)).items).toEqual([
          detached,
        ]);
      });

      it("regionLinkRepository#34 関連づけがない / UnitOfWork の中で関連づけを insert した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ regionLinkRepository }) => {
            await regionLinkRepository.insert(link);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findRegionLink(h, link.key)).toBeNull();
        expect((await byOccasion(h, link.key.occasionId)).items).toEqual([]);
        expect((await byRegion(h, link.key.regionId)).items).toEqual([]);
      });

      it("regionLinkRepository#35 linked の関連づけがある / UnitOfWork の中で delete した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const link = f.regionLink(f.occasionId(), f.region());
        await insertRegionLinks(h, link);
        const read = await getRegionLink(h, link.key);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ regionLinkRepository }) => {
            await regionLinkRepository.delete(link.key, read.expectedVersion);
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getRegionLink(h, link.key);
        expect(after.entity).toEqual(link);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });
    });
  });
}
