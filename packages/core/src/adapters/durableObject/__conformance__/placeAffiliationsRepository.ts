import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  affiliated,
  affiliatedPlaces,
  findAffiliations,
  getAffiliations,
  insertAffiliations,
  REGION_T0,
  regionIds,
  ticker,
  updateAffiliations,
} from "./regionFixtures";

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected a rejection");
    },
    (error: unknown) => error,
  );
}

const at = (minutes: number): Date =>
  new Date(REGION_T0.getTime() + minutes * 60_000);

/** A place affiliated with `regionId` at `when`. */
const affiliatedAt = (
  placeId: PlaceId,
  regionId: RegionId,
  when: Date,
): PlaceAffiliations =>
  PlaceAffiliations.affiliate(
    PlaceAffiliations.empty(placeId, REGION_T0),
    regionId,
    when,
  ).entity;

function saveAffiliations(
  h: ConformanceHarness,
  a: PlaceAffiliations,
  expectedVersion: ExpectedVersion<PlaceAffiliations>,
): Promise<void> {
  return h.uow.run(({ placeAffiliationsRepository }) =>
    placeAffiliationsRepository.save(a, expectedVersion),
  );
}

/** Stores `count` places affiliated with `regionId`, oldest first; returns them newest first. */
async function storeAffiliatedPlaces(
  h: ConformanceHarness,
  ids: ReturnType<typeof regionIds>,
  regionId: RegionId,
  count: number,
): Promise<readonly PlaceId[]> {
  const places = Array.from({ length: count }, () => ids.place());
  await insertAffiliations(
    h,
    ...places.map((placeId, i) => affiliatedAt(placeId, regionId, at(i + 1))),
  );
  return [...places].reverse();
}

/** `spec/testcases/ports/placeAffiliationsRepository.md`. */
export function describePlaceAffiliationsRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("PlaceAffiliationsRepository contract", () => {
    describe("insert・findById・save", () => {
      it("placeAffiliationsRepository#1 店舗の集約が保存されていない / findById を呼ぶ", async () => {
        const h = await makeHarness();
        expect(await findAffiliations(h, regionIds().place())).toBeNull();
      });

      it("placeAffiliationsRepository#2 店舗の集約が保存されていない / 地域 X との所属を1つ持つ集約を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X] = [ids.place(), ids.region()];
        const a = affiliatedAt(P, X, at(1));
        await insertAffiliations(h, a);
        const found = await getAffiliations(h, P);
        expect(found.entity).toEqual(a);
        expect(found.entity.affiliations).toEqual([
          { regionId: X, affiliatedAt: at(1) },
        ]);
        expect(found.entity.chosenRepresentative).toBeNull();
        expect(found.expectedVersion).toBe(a.version);
      });

      it("placeAffiliationsRepository#3 店舗の集約が保存されていない。指定する PlaceId・RegionId の店舗と地域は、どのポートにも保存されていない / その ID の集約を insert する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const a = affiliated(ids.place(), [ids.region()]);
        await insertAffiliations(h, a);
        expect((await getAffiliations(h, a.placeId)).entity).toEqual(a);
      });

      it("placeAffiliationsRepository#4 同じ PlaceId の集約が保存されている / 同じ PlaceId の集約を insert する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const P = ids.place();
        const first = affiliated(P, [ids.region()]);
        await insertAffiliations(h, first);
        await expect(
          insertAffiliations(h, affiliated(P, [ids.region()])),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getAffiliations(h, P)).entity).toEqual(first);
      });

      it("placeAffiliationsRepository#5 X との所属を持つ集約が保存されている / findById の expectedVersion で、Y との所属を加えて Y を選んだ代表地域にした集約を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        await insertAffiliations(h, affiliatedAt(P, X, at(1)));
        const read = await getAffiliations(h, P);
        const withY = PlaceAffiliations.affiliate(read.entity, Y, at(2)).entity;
        const chosen = PlaceAffiliations.chooseRepresentative(
          withY,
          Y,
          at(3),
        ).entity;
        await saveAffiliations(h, chosen, read.expectedVersion);
        const found = await getAffiliations(h, P);
        expect(found.entity).toEqual(chosen);
        expect(PlaceAffiliations.regionIds(found.entity)).toEqual([X, Y]);
        expect(found.entity.chosenRepresentative).toBe(Y);
        expect(found.entity.version).toBe(read.entity.version + 2);
      });

      it("placeAffiliationsRepository#6 X・Y との所属を持ち、Y を選んだ集約が保存されている / Y との所属を解除した集約を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        const a = PlaceAffiliations.chooseRepresentative(
          affiliated(P, [X, Y]),
          Y,
          at(10),
        ).entity;
        await insertAffiliations(h, a);
        const saved = await updateAffiliations(
          h,
          P,
          (current) => PlaceAffiliations.exclude(current, Y, at(11)).entity,
        );
        const found = (await getAffiliations(h, P)).entity;
        expect(found).toEqual(saved);
        expect(PlaceAffiliations.regionIds(found)).toEqual([X]);
        expect(found.chosenRepresentative).toBeNull();
      });

      it("placeAffiliationsRepository#7 X との所属だけを持つ集約が保存されている / X との所属を解除した集約を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X] = [ids.place(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X]));
        const saved = await updateAffiliations(
          h,
          P,
          (current) => PlaceAffiliations.leave(current, X, at(10)).entity,
        );
        const found = await findAffiliations(h, P);
        expect(found).not.toBeNull();
        expect(found?.entity).toEqual(saved);
        expect(found?.entity.affiliations).toEqual([]);
      });

      it("placeAffiliationsRepository#8 集約が保存されている。findById の後に、別の save がコミットされた / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y, Z] = [
          ids.place(),
          ids.region(),
          ids.region(),
          ids.region(),
        ];
        await insertAffiliations(h, affiliated(P, [X]));
        const stale = await getAffiliations(h, P);
        const first = await updateAffiliations(
          h,
          P,
          (current) => PlaceAffiliations.affiliate(current, Y, at(10)).entity,
        );
        const error = await rejection(
          saveAffiliations(
            h,
            PlaceAffiliations.affiliate(stale.entity, Z, at(11)).entity,
            stale.expectedVersion,
          ),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect((await getAffiliations(h, P)).entity).toEqual(first);
      });

      it("placeAffiliationsRepository#9 店舗の集約が保存されていない / その PlaceId の集約を save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        await expect(
          saveAffiliations(
            h,
            affiliated(ids.place(), [ids.region()]),
            0 as ExpectedVersion<PlaceAffiliations>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findAffiliatedPlaces", () => {
      it("placeAffiliationsRepository#10 店舗 P が X に先に所属し、店舗 Q が X に後に所属している / X で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, P, Q] = [ids.region(), ids.place(), ids.place()];
        await insertAffiliations(
          h,
          affiliatedAt(P, X, at(1)),
          affiliatedAt(Q, X, at(2)),
        );
        expect(await affiliatedPlaces(h, X)).toEqual({
          items: [Q, P],
          count: 2,
        });
      });

      it("placeAffiliationsRepository#11 店舗 P と店舗 Q が、同じ affiliatedAt で X に所属している / X で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, P, Q] = [ids.region(), ids.place(), ids.place()];
        await insertAffiliations(
          h,
          affiliatedAt(Q, X, at(1)),
          affiliatedAt(P, X, at(1)),
        );
        expect((await affiliatedPlaces(h, X)).items).toEqual([P, Q]);
      });

      it("placeAffiliationsRepository#12 店舗 P が X と Y に、店舗 R が Y だけに所属している / X で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, Y, P, R] = [
          ids.region(),
          ids.region(),
          ids.place(),
          ids.place(),
        ];
        await insertAffiliations(h, affiliated(P, [X, Y]), affiliated(R, [Y]));
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [P], count: 1 });
      });

      it("placeAffiliationsRepository#13 どの店舗も X に所属していない / X で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, Y] = [ids.region(), ids.region()];
        await insertAffiliations(h, affiliated(ids.place(), [Y]));
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [], count: 0 });
      });

      it("placeAffiliationsRepository#14 1つの店舗が X に所属している / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const X = ids.region();
        const places = await storeAffiliatedPlaces(h, ids, X, 1);
        expect(await affiliatedPlaces(h, X, { page: 1, limit: 10 })).toEqual({
          items: places,
          count: 1,
        });
      });

      it("placeAffiliationsRepository#15 3つの店舗が X に所属している / page: 1、limit: 3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const X = ids.region();
        const places = await storeAffiliatedPlaces(h, ids, X, 3);
        expect(await affiliatedPlaces(h, X, { page: 1, limit: 3 })).toEqual({
          items: places,
          count: 3,
        });
      });

      it("placeAffiliationsRepository#16 5つの店舗が X に所属している / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const X = ids.region();
        const places = await storeAffiliatedPlaces(h, ids, X, 5);
        const first = await affiliatedPlaces(h, X, { page: 1, limit: 3 });
        const second = await affiliatedPlaces(h, X, { page: 2, limit: 3 });
        expect(first).toEqual({ items: places.slice(0, 3), count: 5 });
        expect(second).toEqual({ items: places.slice(3), count: 5 });
      });

      it("placeAffiliationsRepository#17 5つの店舗が X に所属している / page: 3、limit: 3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const X = ids.region();
        await storeAffiliatedPlaces(h, ids, X, 5);
        expect(await affiliatedPlaces(h, X, { page: 3, limit: 3 })).toEqual({
          items: [],
          count: 5,
        });
      });
    });

    describe("集約との整合性", () => {
      it("placeAffiliationsRepository#18 店舗 P の集約が X との所属を持つ / Y との所属を加えた集約を save し、Y で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X]));
        await updateAffiliations(
          h,
          P,
          (a) => PlaceAffiliations.affiliate(a, Y, at(10)).entity,
        );
        expect(await affiliatedPlaces(h, Y)).toEqual({ items: [P], count: 1 });
      });

      it("placeAffiliationsRepository#19 店舗 P の集約が X・Y との所属を持つ / X との所属を解除した集約を save し、X と Y でそれぞれ findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X, Y]));
        await updateAffiliations(
          h,
          P,
          (a) => PlaceAffiliations.exclude(a, X, at(10)).entity,
        );
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [], count: 0 });
        expect(await affiliatedPlaces(h, Y)).toEqual({ items: [P], count: 1 });
      });

      it("placeAffiliationsRepository#20 店舗 P が X に所属した後に店舗 Q が X に所属し、その後に P が X との所属を解除され、X に再び所属した集約が保存されている / X で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [X, P, Q] = [ids.region(), ids.place(), ids.place()];
        const left = PlaceAffiliations.leave(
          affiliatedAt(P, X, at(1)),
          X,
          at(3),
        ).entity;
        const rejoined = PlaceAffiliations.affiliate(left, X, at(4)).entity;
        await insertAffiliations(h, rejoined, affiliatedAt(Q, X, at(2)));
        expect(await affiliatedPlaces(h, X)).toEqual({
          items: [P, Q],
          count: 2,
        });
      });

      it("placeAffiliationsRepository#21 店舗 P の集約が X・Y との所属を持つ / 選んだ代表地域だけを替えた集約を save し、X と Y で findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, Q, X, Y] = [
          ids.place(),
          ids.place(),
          ids.region(),
          ids.region(),
        ];
        await insertAffiliations(
          h,
          affiliated(P, [X, Y]),
          affiliatedAt(Q, X, at(30)),
        );
        const beforeX = await affiliatedPlaces(h, X);
        const beforeY = await affiliatedPlaces(h, Y);
        await updateAffiliations(
          h,
          P,
          (a) => PlaceAffiliations.chooseRepresentative(a, Y, at(40)).entity,
        );
        expect(await affiliatedPlaces(h, X)).toEqual(beforeX);
        expect(await affiliatedPlaces(h, Y)).toEqual(beforeY);
        expect(beforeX).toEqual({ items: [Q, P], count: 2 });
        expect(beforeY).toEqual({ items: [P], count: 1 });
      });
    });

    describe("並行性", () => {
      it("placeAffiliationsRepository#22 店舗の集約が保存されていない / 2つの UnitOfWork が、同じ PlaceId で、X との所属を持つ集約と Y との所属を持つ集約を同時に insert する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        const bothRead = barrier(2);
        const attempt = (a: PlaceAffiliations) =>
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            expect(await placeAffiliationsRepository.findById(P)).toBeNull();
            await bothRead();
            await placeAffiliationsRepository.insert(a);
          });
        const withX = affiliatedAt(P, X, at(1));
        const withY = affiliatedAt(P, Y, at(1));
        const results = await Promise.allSettled([
          attempt(withX),
          attempt(withY),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const winner = results[0]?.status === "fulfilled" ? withX : withY;
        const loser = winner === withX ? Y : X;
        expect((await getAffiliations(h, P)).entity).toEqual(winner);
        expect(await affiliatedPlaces(h, loser)).toEqual({
          items: [],
          count: 0,
        });
      });

      it("placeAffiliationsRepository#23 X・Y との所属を持つ集約が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、X との所属の解除と、Y を選んだ代表地域にする変更を同時に save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X, Y]));
        const bothRead = barrier(2);
        const attempt = (change: (a: PlaceAffiliations) => PlaceAffiliations) =>
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            const read = await placeAffiliationsRepository.findById(P);
            if (read === null) throw new Error("affiliations missing");
            await bothRead();
            const next = change(read.entity);
            await placeAffiliationsRepository.save(next, read.expectedVersion);
            return next;
          });
        const results = await Promise.allSettled([
          attempt((a) => PlaceAffiliations.exclude(a, X, at(10)).entity),
          attempt(
            (a) => PlaceAffiliations.chooseRepresentative(a, Y, at(10)).entity,
          ),
        ]);
        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<PlaceAffiliations> =>
            r.status === "fulfilled",
        );
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await getAffiliations(h, P)).entity).toEqual(
          fulfilled[0]?.value,
        );
      });

      it("placeAffiliationsRepository#24 X との所属を持つ集約が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、どちらも Y との所属を加えて同時に save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X]));
        const bothRead = barrier(2);
        const tick = ticker(at(100));
        const attempt = () =>
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            const read = await placeAffiliationsRepository.findById(P);
            if (read === null) throw new Error("affiliations missing");
            await bothRead();
            await placeAffiliationsRepository.save(
              PlaceAffiliations.affiliate(read.entity, Y, tick()).entity,
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([attempt(), attempt()]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const found = (await getAffiliations(h, P)).entity;
        expect(PlaceAffiliations.regionIds(found)).toEqual([X, Y]);
        expect(await affiliatedPlaces(h, Y)).toEqual({ items: [P], count: 1 });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("placeAffiliationsRepository#25 店舗の集約が保存されていない / UnitOfWork の中で insert してコミットし、直後に findById と findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X] = [ids.place(), ids.region()];
        const a = affiliated(P, [X]);
        await insertAffiliations(h, a);
        expect((await getAffiliations(h, P)).entity).toEqual(a);
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [P], count: 1 });
      });

      it("placeAffiliationsRepository#26 集約が保存されている / UnitOfWork の中で、所属を解除した集約を save してコミットし、直後に findById と findAffiliatedPlaces を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X] = [ids.place(), ids.region()];
        await insertAffiliations(h, affiliated(P, [X]));
        await updateAffiliations(
          h,
          P,
          (a) => PlaceAffiliations.exclude(a, X, at(10)).entity,
        );
        expect((await getAffiliations(h, P)).entity.affiliations).toEqual([]);
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [], count: 0 });
      });

      it("placeAffiliationsRepository#27 店舗の集約が保存されていない / UnitOfWork の中で insert した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X] = [ids.place(), ids.region()];
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            await placeAffiliationsRepository.insert(affiliated(P, [X]));
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findAffiliations(h, P)).toBeNull();
        expect(await affiliatedPlaces(h, X)).toEqual({ items: [], count: 0 });
      });

      it("placeAffiliationsRepository#28 X との所属を持つ集約が保存されている / UnitOfWork の中で、Y との所属を加えた集約を save した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, X, Y] = [ids.place(), ids.region(), ids.region()];
        const a = affiliated(P, [X]);
        await insertAffiliations(h, a);
        const read = await getAffiliations(h, P);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            await placeAffiliationsRepository.save(
              PlaceAffiliations.affiliate(read.entity, Y, at(10)).entity,
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getAffiliations(h, P);
        expect(after.entity).toEqual(a);
        expect(after.expectedVersion).toBe(read.expectedVersion);
        expect(await affiliatedPlaces(h, Y)).toEqual({ items: [], count: 0 });
      });

      it("placeAffiliationsRepository#29 店舗 P の集約と店舗 Q の集約が保存されている / 1つの UnitOfWork の中で、P を save し、Q を古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const ids = regionIds();
        const [P, Q, X, Y] = [
          ids.place(),
          ids.place(),
          ids.region(),
          ids.region(),
        ];
        const p = affiliated(P, [X]);
        await insertAffiliations(h, p, affiliated(Q, [X]));
        const readP = await getAffiliations(h, P);
        const staleQ = await getAffiliations(h, Q);
        const q = await updateAffiliations(
          h,
          Q,
          (a) => PlaceAffiliations.affiliate(a, Y, at(10)).entity,
        );
        await expect(
          h.uow.run(async ({ placeAffiliationsRepository }) => {
            await placeAffiliationsRepository.save(
              PlaceAffiliations.affiliate(readP.entity, Y, at(11)).entity,
              readP.expectedVersion,
            );
            await placeAffiliationsRepository.save(
              PlaceAffiliations.exclude(staleQ.entity, X, at(11)).entity,
              staleQ.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getAffiliations(h, P)).entity).toEqual(p);
        expect((await getAffiliations(h, Q)).entity).toEqual(q);
        expect(await affiliatedPlaces(h, Y)).toEqual({ items: [Q], count: 1 });
      });
    });
  });
}
