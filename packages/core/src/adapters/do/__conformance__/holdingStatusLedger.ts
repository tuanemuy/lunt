import type { OccasionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { Version } from "@repo/core/domain/common/version";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import type { HoldingStatusRecord } from "@repo/core/domain/occasion/holdingStatusObserver";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  day,
  getOccasion,
  insertOccasions,
  type OccasionFactory,
  occasionFactory,
  page,
  putRecord,
  saveOccasion,
  updateOccasion,
} from "./occasionFixtures";

type H = ConformanceHarness;

const TODAY = day("2026-09-30");

const toObserve = (
  h: H,
  today: LocalDate = TODAY,
  pagination: Pagination = page(1),
) =>
  h.uow.run(({ holdingStatusLedger }) =>
    holdingStatusLedger.findToObserve(today, pagination),
  );

const idsToObserve = async (
  h: H,
  today: LocalDate = TODAY,
  pagination: Pagination = page(1),
): Promise<readonly OccasionId[]> =>
  (await toObserve(h, today, pagination)).items.map((item) => item.occasion.id);

const find = (h: H, id: OccasionId) =>
  h.uow.run(({ holdingStatusLedger }) => holdingStatusLedger.find(id));

const record = (
  occasion: Occasion,
  lastObserved: HoldingStatus | null,
  nextChangeOn: string | null,
  observedVersion: Version = occasion.version,
): HoldingStatusRecord => ({
  occasionId: occasion.id,
  lastObserved,
  observedVersion,
  nextChangeOn: nextChangeOn === null ? null : day(nextChangeOn),
});

/** A new version of the stored occasion (suspended). */
const bump = (h: H, f: OccasionFactory, occasion: Occasion) =>
  updateOccasion(
    h,
    occasion.id,
    (current) => Occasion.suspend(current, f.tick()).entity,
  );

/** `count` published occasions with no record, ids ascending. */
async function pending(
  h: H,
  f: OccasionFactory,
  count: number,
): Promise<readonly Occasion[]> {
  const occasions = Array.from({ length: count }, () => f.published());
  await insertOccasions(h, ...occasions);
  return occasions;
}

/** `spec/testcases/ports/holdingStatusLedger.md`. */
export function describeHoldingStatusLedgerContract(
  makeHarness: HarnessFactory,
): void {
  describe("HoldingStatusLedger contract", () => {
    describe("findToObserve", () => {
      it("holdingStatusLedger#1 イベント O がある。記録がない / today: 9/30 で findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        expect(await toObserve(h, day("2026-09-30"))).toEqual({
          items: [{ occasion: o, record: null }],
          count: 1,
        });
      });

      it("holdingStatusLedger#2 開催期間のない draft のイベント O がある。記録がない / findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.bareDraft({ name: "期間なし" });
        await insertOccasions(h, o);
        expect((await toObserve(h)).items).toEqual([
          { occasion: o, record: null },
        ]);
      });

      it("holdingStatusLedger#3 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: null / today: 12/31 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        await putRecord(h, record(o, "ended", null));
        expect(await idsToObserve(h, day("2026-12-31"))).toEqual([]);
      });

      it("holdingStatusLedger#4 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: 10/1 / today: 9/30 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        expect(await idsToObserve(h, day("2026-09-30"))).toEqual([]);
      });

      it("holdingStatusLedger#5 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: 10/1 / today: 10/1 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        const r = record(o, "upcoming", "2026-10-01");
        await putRecord(h, r);
        expect((await toObserve(h, day("2026-10-01"))).items).toEqual([
          { occasion: o, record: r },
        ]);
      });

      it("holdingStatusLedger#6 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: 10/1 / today: 10/5 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        expect(await idsToObserve(h, day("2026-10-05"))).toEqual([o.id]);
      });

      it("holdingStatusLedger#7 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: null。その後に OccasionRepository.save でイベントを更新し、版が進んだ / findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        const r = record(o, "ended", null);
        await putRecord(h, r);
        const updated = await bump(h, f, o);
        expect((await toObserve(h)).items).toEqual([
          { occasion: updated, record: r },
        ]);
      });

      it("holdingStatusLedger#8 イベント O の記録は、observedVersion がイベントの版と同じで、nextChangeOn: 11/1。その後にイベントの版が進んだ / today: 10/1 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await insertOccasions(h, o);
        await putRecord(h, record(o, "upcoming", "2026-11-01"));
        await bump(h, f, o);
        expect(await idsToObserve(h, day("2026-10-01"))).toEqual([o.id]);
      });

      it("holdingStatusLedger#9 開催期間を過ぎた draft、unpublished、運営による非公開のイベントが1件ずつあり、どれも記録がない / findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const past = { period: ["2026-09-01", "2026-09-03"] } as const;
        const occasions = [
          f.draft(past),
          f.unpublished(past),
          f.suspended(f.published(past)),
        ];
        await insertOccasions(h, ...occasions);
        expect(await idsToObserve(h)).toEqual(occasions.map((o) => o.id));
      });

      it("holdingStatusLedger#10 記録がないイベントが3件ある（ID は A < B < C） / findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [a, b, c] = [f.published(), f.published(), f.published()];
        await insertOccasions(h, c, a, b);
        expect(await idsToObserve(h)).toEqual([a.id, b.id, c.id]);
      });

      it("holdingStatusLedger#11 記録がないイベントが A・B の2件ある / A の記録を、A の今の版と nextChangeOn: null で put し、page: 1 で findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [a, b] = await pending(h, f, 2);
        if (a === undefined || b === undefined) throw new Error("two");
        await putRecord(h, record(a, "upcoming", null));
        const result = await toObserve(h, TODAY, page(1));
        expect(result.items.map((i) => i.occasion.id)).toEqual([b.id]);
        expect(result.count).toBe(1);
      });

      it("holdingStatusLedger#12 どのイベントも、記録の observedVersion がイベントの版と同じで、nextChangeOn が today より後か null / page: 1 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [a, b] = await pending(h, f, 2);
        if (a === undefined || b === undefined) throw new Error("two");
        await putRecord(h, record(a, "upcoming", "2026-10-01"));
        await putRecord(h, record(b, "ended", null));
        expect(await toObserve(h, TODAY, page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("holdingStatusLedger#13 確かめ直すイベントが1件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        const result = await toObserve(h, TODAY, page(1, 10));
        expect(result.items.map((i) => i.occasion.id)).toEqual([o?.id]);
        expect(result.count).toBe(1);
      });

      it("holdingStatusLedger#14 確かめ直すイベントが10件ある / page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const all = await pending(h, f, 10);
        const first = await toObserve(h, TODAY, page(1, 10));
        expect(first.items.map((i) => i.occasion.id)).toEqual(
          all.map((o) => o.id),
        );
        expect(first.count).toBe(10);
        expect(await toObserve(h, TODAY, page(2, 10))).toEqual({
          items: [],
          count: 10,
        });
      });

      it("holdingStatusLedger#15 確かめ直すイベントが11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const all = (await pending(h, f, 11)).map((o) => o.id);
        expect(await idsToObserve(h, TODAY, page(1, 10))).toEqual(
          all.slice(0, 10),
        );
        expect(await idsToObserve(h, TODAY, page(2, 10))).toEqual(
          all.slice(10),
        );
        expect((await toObserve(h, TODAY, page(2, 10))).count).toBe(11);
      });

      it("holdingStatusLedger#16 確かめ直すイベントが11件ある / page: 3、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await pending(h, f, 11);
        expect(await toObserve(h, TODAY, page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("find", () => {
      it("holdingStatusLedger#17 イベント O がある。記録がない / イベント O で find を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        expect(await find(h, o.id)).toBeNull();
      });

      it("holdingStatusLedger#18 イベント O は保存されていない。その occasionId の記録を put した / その occasionId で find を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await putRecord(h, record(o, "ongoing", "2026-10-04"));
        expect(await find(h, o.id)).toBeNull();
      });

      it("holdingStatusLedger#19 イベント O の記録を put した / イベント O で find を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        const r = record(o, "ongoing", "2026-10-04");
        await putRecord(h, r);
        expect(await find(h, o.id)).toEqual(r);
      });

      it("holdingStatusLedger#20 イベント O と N の記録がある / イベント O の記録を put で置き換え、イベント O と N でそれぞれ find を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n] = await pending(h, f, 2);
        if (o === undefined || n === undefined) throw new Error("two");
        const rn = record(n, "upcoming", "2026-10-01");
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        await putRecord(h, rn);
        const replaced = record(o, "ongoing", "2026-10-04");
        await putRecord(h, replaced);
        expect(await find(h, o.id)).toEqual(replaced);
        expect(await find(h, n.id)).toEqual(rn);
      });
    });

    describe("put", () => {
      it('holdingStatusLedger#21 イベント O がある。記録がない / lastObserved: "upcoming"、イベントの版より古い observedVersion、nextChangeOn: 10/1 の記録を put し、findToObserve を呼ぶ', async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        const r = record(o, "upcoming", "2026-10-01", Version.create(0));
        await putRecord(h, r);
        expect((await toObserve(h)).items).toEqual([
          { occasion: o, record: r },
        ]);
      });

      it('holdingStatusLedger#22 イベント O の記録の lastObserved は upcoming / lastObserved: "ongoing" で、observedVersion をイベントの版より古くした記録を put し、findToObserve を呼ぶ', async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        const r = record(o, "ongoing", "2026-10-04", Version.create(0));
        await putRecord(h, r);
        const result = await toObserve(h);
        expect(result.items).toEqual([{ occasion: o, record: r }]);
        expect(result.count).toBe(1);
      });

      it("holdingStatusLedger#23 イベント O の記録がある / 版を渡さずに、続けて2回 put する（ongoing、次に ended）", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        await putRecord(h, record(o, "ongoing", "2026-10-04"));
        const last = record(o, "ended", null);
        await putRecord(h, last);
        expect(await find(h, o.id)).toEqual(last);
      });

      it("holdingStatusLedger#24 イベント O がある。OccasionRepository.findById で expectedVersion を得ている / 記録を put した後、先に得た expectedVersion で OccasionRepository.save を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        const read = await getOccasion(h, o.id);
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        const next = Occasion.suspend(read.entity, f.tick()).entity;
        await saveOccasion(h, next, read.expectedVersion);
        expect((await getOccasion(h, o.id)).entity).toEqual(next);
      });

      it("holdingStatusLedger#25 イベント O と N の記録がある / イベント O の記録を put する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o, n] = await pending(h, f, 2);
        if (o === undefined || n === undefined) throw new Error("two");
        const rn = record(n, "ended", null);
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        await putRecord(h, rn);
        await putRecord(h, record(o, "ongoing", "2026-10-04"));
        expect(await find(h, n.id)).toEqual(rn);
      });

      it("holdingStatusLedger#26 イベント O は保存されていない / その occasionId の記録を put する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.published();
        await putRecord(h, record(o, "upcoming", "2026-10-01"));
        expect(await idsToObserve(h, day("2026-10-05"))).toEqual([]);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("holdingStatusLedger#27 記録のないイベント O がある / UnitOfWork の中で、イベント O の版と nextChangeOn: null の記録を put してコミットし、直後に findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        await h.uow.run(({ holdingStatusLedger }) =>
          holdingStatusLedger.put(record(o, "ended", null)),
        );
        expect(await idsToObserve(h)).toEqual([]);
      });

      it("holdingStatusLedger#28 記録のないイベント O がある / UnitOfWork の中で記録を put し、collectEvents に occasion.ended を渡した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [o] = await pending(h, f, 1);
        if (o === undefined) throw new Error("one");
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ holdingStatusLedger, collectEvents }) => {
            await holdingStatusLedger.put(record(o, "ended", null));
            collectEvents([
              {
                type: "occasion.ended",
                payload: { occasionId: o.id, observedOn: TODAY },
                occurredAt: f.tick(),
                aggregateId: o.id,
              },
            ]);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await toObserve(h)).items).toEqual([
          { occasion: o, record: null },
        ]);
        expect(await h.savedEvents()).toEqual([]);
      });

      it("holdingStatusLedger#29 イベントがない / UnitOfWork の中で OccasionRepository.insert をコミットし、直後に findToObserve を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const o = f.draft();
        await h.uow.run(({ occasionRepository }) =>
          occasionRepository.insert(o),
        );
        expect((await toObserve(h)).items).toEqual([
          { occasion: o, record: null },
        ]);
      });
    });
  });
}
