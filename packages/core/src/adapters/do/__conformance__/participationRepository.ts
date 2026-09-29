import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import {
  Participation,
  type ParticipationDetails,
} from "@repo/core/domain/occasion/participation";
import { describe, expect, it } from "vitest";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  day,
  findParticipation,
  getParticipation,
  insertParticipations,
  type OccasionFactory,
  occasionFactory,
  page,
} from "./occasionFixtures";

type H = ConformanceHarness;

const byOccasion = (h: H, id: OccasionId, pagination: Pagination = page(1)) =>
  h.uow.run(({ participationRepository }) =>
    participationRepository.findByOccasion(id, pagination),
  );

const byPlace = (h: H, id: PlaceId, pagination: Pagination = page(1)) =>
  h.uow.run(({ participationRepository }) =>
    participationRepository.findByPlace(id, pagination),
  );

const places = (items: readonly Participation[]): readonly PlaceId[] =>
  items.map((p) => p.key.placeId);

const occasions = (items: readonly Participation[]): readonly OccasionId[] =>
  items.map((p) => p.key.occasionId);

const save = (
  h: H,
  p: Participation,
  expectedVersion: ExpectedVersion<Participation>,
) =>
  h.uow.run(({ participationRepository }) =>
    participationRepository.save(p, expectedVersion),
  );

const remove = (
  h: H,
  p: Participation,
  expectedVersion: ExpectedVersion<Participation>,
) =>
  h.uow.run(({ participationRepository }) =>
    participationRepository.delete(p.key, expectedVersion),
  );

/** The participation with `details` in place of its own, as a change makes it. */
const changed = (
  f: OccasionFactory,
  p: Participation,
  details: ParticipationDetails,
): Participation => Participation.changeByPlace(p, details, f.tick()).entity;

/** `count` participations of one occasion, each newer than the one before. */
const ofOccasion = (
  f: OccasionFactory,
  occasionId: OccasionId,
  count: number,
) =>
  Array.from({ length: count }, () => f.participation(occasionId, f.place()));

const ofPlace = (f: OccasionFactory, placeId: PlaceId, count: number) =>
  Array.from({ length: count }, () => f.participation(f.occasionId(), placeId));

/** Newest `participatedAt` first. */
const newestFirst = (items: readonly Participation[]) => [...items].reverse();

/** `spec/testcases/ports/participationRepository.md`. */
export function describeParticipationRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("ParticipationRepository contract", () => {
    describe("insert・findById・save・delete", () => {
      it("participationRepository#1 参加がない / イベント O と店舗 P の組の参加（添えた掲載 L2・L1 の順、参加日 10/1・10/2）を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [l1, l2] = [f.listing(), f.listing()];
        const p = f.participation(f.occasionId(), f.place(), {
          listingIds: [l2, l1],
          dates: [day("2026-10-01"), day("2026-10-02")],
        });
        await insertParticipations(h, p);
        const read = await getParticipation(h, p.key);
        expect(read.entity).toEqual(p);
        expect(read.entity.details.listingIds).toEqual([l2, l1]);
        expect(read.expectedVersion).toBe(p.version);
      });

      it("participationRepository#2 参加がない / 添えた掲載も参加日も空の参加を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        expect((await getParticipation(h, p.key)).entity.details).toEqual({
          listingIds: [],
          dates: [],
        });
      });

      it("participationRepository#3 イベント O と店舗 P の組の参加がある / 同じ組の参加を insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const again = f.participation(p.key.occasionId, p.key.placeId, {
          listingIds: [f.listing()],
          dates: [],
        });
        await expect(insertParticipations(h, again)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await getParticipation(h, p.key)).entity).toEqual(p);
      });

      it("participationRepository#4 イベント O と店舗 P の組の参加がある / イベント O と店舗 Q の組、イベント N と店舗 P の組の参加を insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n, p, q] = [
          f.occasionId(),
          f.occasionId(),
          f.place(),
          f.place(),
        ];
        await insertParticipations(h, f.participation(o, p));
        const oq = f.participation(o, q);
        const np = f.participation(n, p);
        await insertParticipations(h, oq, np);
        expect((await getParticipation(h, oq.key)).entity).toEqual(oq);
        expect((await getParticipation(h, np.key)).entity).toEqual(np);
      });

      it("participationRepository#5 イベント O と店舗 P の組に参加がない。2つの要求が同時に同じ組の参加を insert する / 両方をコミットする", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, p] = [f.occasionId(), f.place()];
        const a = f.participation(o, p);
        const b = f.participation(o, p, {
          listingIds: [f.listing()],
          dates: [],
        });
        const results = await Promise.allSettled([
          insertParticipations(h, a),
          insertParticipations(h, b),
        ]);
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
        const winner = results[0]?.status === "fulfilled" ? a : b;
        expect((await getParticipation(h, a.key)).entity).toEqual(winner);
        expect((await byOccasion(h, o)).count).toBe(1);
      });

      it("participationRepository#6 参加がない / 参加のない組で findById を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        expect(
          await findParticipation(h, {
            occasionId: f.occasionId(),
            placeId: f.place(),
          }),
        ).toBeNull();
      });

      it("participationRepository#7 イベント O と店舗 P の組の参加がある / findById が返した expectedVersion を使って、参加内容を置き換えた参加を save し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const read = await getParticipation(h, p.key);
        const next = changed(f, read.entity, {
          listingIds: [f.listing()],
          dates: [day("2026-10-02")],
        });
        await save(h, next, read.expectedVersion);
        const after = await getParticipation(h, p.key);
        expect(after.entity).toEqual(next);
        expect(after.entity.version).toBe(read.entity.version + 1);
      });

      it("participationRepository#8 2つの要求が、同じ参加を同じ expectedVersion で読んでいる / 両方が参加内容を置き換えて save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const first = await getParticipation(h, p.key);
        const second = await getParticipation(h, p.key);
        const winner = changed(f, first.entity, {
          listingIds: [f.listing()],
          dates: [],
        });
        await save(h, winner, first.expectedVersion);
        await expect(
          save(
            h,
            changed(f, second.entity, {
              listingIds: [],
              dates: [day("2026-10-01")],
            }),
            second.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getParticipation(h, p.key)).entity).toEqual(winner);
      });

      it("participationRepository#9 参加がない / 参加のない組の参加を save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await expect(
          save(
            h,
            f.participation(f.occasionId(), f.place()),
            0 as ExpectedVersion<Participation>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("participationRepository#10 イベント O と店舗 P の組の参加がある / findById が返した expectedVersion で delete し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const read = await getParticipation(h, p.key);
        await remove(h, p, read.expectedVersion);
        expect(await findParticipation(h, p.key)).toBeNull();
        expect((await byOccasion(h, p.key.occasionId)).items).toEqual([]);
        expect((await byPlace(h, p.key.placeId)).items).toEqual([]);
      });

      it("participationRepository#11 参加を delete した後 / 同じ組の参加を、新しい participatedAt で insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        await remove(h, p, (await getParticipation(h, p.key)).expectedVersion);
        const again = f.participation(p.key.occasionId, p.key.placeId);
        await insertParticipations(h, again);
        const read = (await getParticipation(h, p.key)).entity;
        expect(read).toEqual(again);
        expect(read.participatedAt.getTime()).toBeGreaterThan(
          p.participatedAt.getTime(),
        );
      });

      it("participationRepository#12 2つの要求が、同じ参加を同じ expectedVersion で読んでいる / 両方が delete する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const first = await getParticipation(h, p.key);
        const second = await getParticipation(h, p.key);
        await remove(h, p, first.expectedVersion);
        await expect(
          remove(h, p, second.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("participationRepository#13 参加を findById で読んだ後に、別の save が成立して版が進んでいる / 古い expectedVersion で delete する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const read = await getParticipation(h, p.key);
        const next = changed(f, read.entity, {
          listingIds: [f.listing()],
          dates: [],
        });
        await save(h, next, read.expectedVersion);
        await expect(remove(h, p, read.expectedVersion)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await getParticipation(h, p.key)).entity).toEqual(next);
      });

      it("participationRepository#14 参加がない / 参加のない組を delete する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await expect(
          remove(
            h,
            f.participation(f.occasionId(), f.place()),
            0 as ExpectedVersion<Participation>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findByOccasion", () => {
      it("participationRepository#15 イベント O に、店舗 P（participatedAt が古い）、店舗 Q（新しい）が参加中。イベント N に店舗 R が参加中 / イベント O で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n] = [f.occasionId(), f.occasionId()];
        const p = f.participation(o, f.place());
        const q = f.participation(o, f.place());
        const r = f.participation(n, f.place());
        await insertParticipations(h, p, r, q);
        const result = await byOccasion(h, o);
        expect(result.items).toEqual([q, p]);
        expect(result.count).toBe(2);
      });

      it("participationRepository#16 イベント O に、同じ participatedAt の店舗 A・B（PlaceId は A < B）が参加中 / イベント O で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const [a, b] = [f.place(), f.place()];
        const at = f.tick();
        await insertParticipations(
          h,
          f.participation(o, b, undefined, at),
          f.participation(o, a, undefined, at),
        );
        expect(places((await byOccasion(h, o)).items)).toEqual([a, b]);
      });

      it("participationRepository#17 イベント O に参加がない / page: 1 で findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertParticipations(
          h,
          f.participation(f.occasionId(), f.place()),
        );
        expect(await byOccasion(h, f.occasionId(), page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("participationRepository#18 イベント O に参加が1件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const only = f.participation(o, f.place());
        await insertParticipations(h, only);
        expect(await byOccasion(h, o, page(1, 10))).toEqual({
          items: [only],
          count: 1,
        });
      });

      it("participationRepository#19 イベント O に参加が10件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const all = ofOccasion(f, o, 10);
        await insertParticipations(h, ...all);
        const first = await byOccasion(h, o, page(1, 10));
        expect(first.items).toEqual(newestFirst(all));
        expect(first.count).toBe(10);
        expect(await byOccasion(h, o, page(2, 10))).toEqual({
          items: [],
          count: 10,
        });
      });

      it("participationRepository#20 イベント O に参加が11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        const all = ofOccasion(f, o, 11);
        await insertParticipations(h, ...all);
        const ordered = newestFirst(all);
        const first = await byOccasion(h, o, page(1, 10));
        const second = await byOccasion(h, o, page(2, 10));
        expect(first.items).toEqual(ordered.slice(0, 10));
        expect(second.items).toEqual(ordered.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });

      it("participationRepository#21 イベント O に参加が11件ある / page: 3、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.occasionId();
        await insertParticipations(h, ...ofOccasion(f, o, 11));
        expect(await byOccasion(h, o, page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("findByPlace", () => {
      it("participationRepository#22 店舗 P が、イベント M（participatedAt が古い）、イベント N（新しい）に参加中。店舗 Q がイベント M に参加中 / 店舗 P で findByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [m, n] = [f.occasionId(), f.occasionId()];
        const [p, q] = [f.place(), f.place()];
        const pm = f.participation(m, p);
        const qm = f.participation(m, q);
        const pn = f.participation(n, p);
        await insertParticipations(h, pm, qm, pn);
        const result = await byPlace(h, p);
        expect(result.items).toEqual([pn, pm]);
        expect(result.count).toBe(2);
      });

      it("participationRepository#23 店舗 P が、同じ participatedAt のイベント A・B（OccasionId は A < B）に参加中 / 店舗 P で findByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.place();
        const [a, b] = [f.occasionId(), f.occasionId()];
        const at = f.tick();
        await insertParticipations(
          h,
          f.participation(b, p, undefined, at),
          f.participation(a, p, undefined, at),
        );
        expect(occasions((await byPlace(h, p)).items)).toEqual([a, b]);
      });

      it("participationRepository#24 店舗 P に参加がない / page: 1 で findByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertParticipations(
          h,
          f.participation(f.occasionId(), f.place()),
        );
        expect(await byPlace(h, f.place(), page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("participationRepository#25 店舗 P に参加が1件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.place();
        const only = f.participation(f.occasionId(), p);
        await insertParticipations(h, only);
        expect(await byPlace(h, p, page(1, 10))).toEqual({
          items: [only],
          count: 1,
        });
      });

      it("participationRepository#26 店舗 P に参加が10件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.place();
        const all = ofPlace(f, p, 10);
        await insertParticipations(h, ...all);
        const first = await byPlace(h, p, page(1, 10));
        expect(first.items).toEqual(newestFirst(all));
        expect(first.count).toBe(10);
        expect(await byPlace(h, p, page(2, 10))).toEqual({
          items: [],
          count: 10,
        });
      });

      it("participationRepository#27 店舗 P に参加が11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.place();
        const all = ofPlace(f, p, 11);
        await insertParticipations(h, ...all);
        const ordered = newestFirst(all);
        const first = await byPlace(h, p, page(1, 10));
        const second = await byPlace(h, p, page(2, 10));
        expect(first.items).toEqual(ordered.slice(0, 10));
        expect(second.items).toEqual(ordered.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });

      it("participationRepository#28 店舗 P に参加が11件ある / page: 3、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.place();
        await insertParticipations(h, ...ofPlace(f, p, 11));
        expect(await byPlace(h, p, page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("participationRepository#29 参加がない / UnitOfWork の中で参加を insert してコミットし、直後に findById・findByOccasion・findByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await h.uow.run(({ participationRepository }) =>
          participationRepository.insert(p),
        );
        expect((await getParticipation(h, p.key)).entity).toEqual(p);
        expect((await byOccasion(h, p.key.occasionId)).items).toEqual([p]);
        expect((await byPlace(h, p.key.placeId)).items).toEqual([p]);
      });

      it("participationRepository#30 参加がある / UnitOfWork の中で参加内容を置き換えて save してコミットし、直後に findByOccasion を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const next = await h.uow.run(async ({ participationRepository }) => {
          const read = await participationRepository.findById(p.key);
          if (read === null) throw new Error("no participation");
          const changedOne = changed(f, read.entity, {
            listingIds: [f.listing()],
            dates: [day("2026-10-03")],
          });
          await participationRepository.save(changedOne, read.expectedVersion);
          return changedOne;
        });
        expect((await byOccasion(h, p.key.occasionId)).items).toEqual([next]);
      });

      it("participationRepository#31 参加がない / UnitOfWork の中で参加を insert した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ participationRepository }) => {
            await participationRepository.insert(p);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findParticipation(h, p.key)).toBeNull();
        expect((await byOccasion(h, p.key.occasionId)).items).toEqual([]);
        expect((await byPlace(h, p.key.placeId)).items).toEqual([]);
      });

      it("participationRepository#32 参加がある / UnitOfWork の中で参加を delete した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const p = f.participation(f.occasionId(), f.place());
        await insertParticipations(h, p);
        const read = await getParticipation(h, p.key);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ participationRepository }) => {
            await participationRepository.delete(p.key, read.expectedVersion);
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getParticipation(h, p.key);
        expect(after.entity).toEqual(p);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });
    });
  });
}
