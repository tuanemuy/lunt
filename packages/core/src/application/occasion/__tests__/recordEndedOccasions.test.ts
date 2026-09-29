import type { OccasionId } from "@repo/core/domain/common/ids";
import type { HoldingStatusLedger } from "@repo/core/domain/occasion/ports/holdingStatusLedger";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { type OccasionKit, occasionKit } from "./kit";

/** A published occasion held 10/1〜10/3 with no occasion operator, and its operator. */
async function setUp() {
  const k = await occasionKit();
  const o = await k.operator();
  const occasion = await k.published(o);
  return { k, o, id: occasion.id };
}

async function ended(k: OccasionKit) {
  return (await k.events("occasion.ended")).map((e) => e.payload);
}

/** A container whose ledger refuses to `put` the records of `failing`. */
function failingPuts(
  k: OccasionKit,
  failing: ReadonlySet<OccasionId>,
): RequestContainer {
  return {
    ...k.container,
    unitOfWorkProvider: {
      run: (fn) =>
        k.container.unitOfWorkProvider.run((ctx) => {
          const ledger = ctx.holdingStatusLedger;
          const wrapped: HoldingStatusLedger = {
            findToObserve: (today, pagination) =>
              ledger.findToObserve(today, pagination),
            find: (id) => ledger.find(id),
            put: (record) =>
              failing.has(record.occasionId)
                ? Promise.reject(new Error("write failed"))
                : ledger.put(record),
          };
          return fn({ ...ctx, holdingStatusLedger: wrapped });
        }),
    },
  };
}

/** `count` published occasions (10/1〜10/3) whose records read `ongoing` (a 10/2 run). */
async function ongoing(k: OccasionKit, o: Person, count: number) {
  const ids: OccasionId[] = [];
  for (let i = 0; i < count; i++) ids.push((await k.published(o)).id);
  await k.runJob("2026-10-02");
  return ids;
}

describe("recordEndedOccasions", () => {
  it("recordEndedOccasions#1 イベント O の開催期間は 10/1〜10/3 で、中止でない。記録の lastObserved は ongoing / 10/4 にジョブを実行する", async () => {
    const { k, id } = await setUp();
    await k.runJob("2026-10-02");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "ongoing",
      nextChangeOn: "2026-10-04",
    });
    const before = await k.stored(id);
    const report = await k.runJob("2026-10-04");
    expect(report).toMatchObject({ processed: 1, failed: 0 });
    expect(await k.record(id)).toEqual({
      occasionId: id,
      lastObserved: "ended",
      observedVersion: before.entity.version,
      nextChangeOn: null,
    });
    expect(await ended(k)).toEqual([
      { occasionId: id, observedOn: "2026-10-04" },
    ]);
    const after = await k.stored(id);
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity).toEqual(before.entity);
  });

  it("recordEndedOccasions#2 上のジョブが成立した後 / 同じ 10/4 に、もう一度ジョブを実行する", async () => {
    const { k, id } = await setUp();
    await k.runJob("2026-10-02");
    await k.runJob("2026-10-04");
    const record = await k.record(id);
    const mark = await k.mark();
    const report = await k.runJob("2026-10-04");
    expect(report).toMatchObject({ processed: 0, failed: 0 });
    expect(await k.record(id)).toEqual(record);
    expect(await k.since(mark)).toEqual([]);
  });

  it("recordEndedOccasions#3 イベント O の開催期間は 10/1〜10/3。記録がない / 9/30 にジョブを実行する", async () => {
    const { k, id } = await setUp();
    expect(await k.record(id)).toBeNull();
    await k.runJob("2026-09-30");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "upcoming",
      nextChangeOn: "2026-10-01",
    });
    expect(await ended(k)).toEqual([]);
  });

  it("recordEndedOccasions#4 イベント O の開催期間は 10/1〜10/3。記録の lastObserved は upcoming / 10/1 にジョブを実行する", async () => {
    const { k, id } = await setUp();
    await k.runJob("2026-09-30");
    await k.runJob("2026-10-01");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "ongoing",
      nextChangeOn: "2026-10-04",
    });
    expect(await ended(k)).toEqual([]);
  });

  it("recordEndedOccasions#5 上のジョブが成立した後 / 10/3 にジョブを実行する", async () => {
    const { k, id } = await setUp();
    await k.runJob("2026-09-30");
    await k.runJob("2026-10-01");
    const record = await k.record(id);
    const report = await k.runJob("2026-10-03");
    expect(report.processed).toBe(0);
    expect(await k.record(id)).toEqual(record);
    expect(await ended(k)).toEqual([]);
  });

  it("recordEndedOccasions#6 イベント O は draft で開催期間を過ぎている。イベント Q は運営による非公開で開催期間を過ぎている。どちらも記録の lastObserved は ongoing / ジョブを実行する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const draft = await k.register(o);
    const suspended = await k.published(o);
    await k.suspend(o, suspended.id);
    await k.runJob("2026-10-02");
    for (const id of [draft.id, suspended.id]) {
      expect((await k.record(id))?.lastObserved).toBe("ongoing");
    }
    await k.runJob("2026-10-04");
    for (const id of [draft.id, suspended.id]) {
      expect((await k.record(id))?.lastObserved).toBe("ended");
    }
    expect(
      (await ended(k)).map((p) => (p as { occasionId: string }).occasionId),
    ).toEqual([draft.id, suspended.id].sort());
  });

  it("recordEndedOccasions#7 イベント O は開催期間を過ぎていて、中止中。記録の lastObserved は ongoing / ジョブを実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-02");
    await k.cancel(o, id);
    await k.runJob("2026-10-04");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "cancelled",
      nextChangeOn: null,
    });
    expect(await ended(k)).toEqual([]);
  });

  it("recordEndedOccasions#8 イベント O の記録の lastObserved は ended。その後に updateOccasionContent で開催期間が未来へ更新された / ジョブを実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-04");
    expect((await k.record(id))?.lastObserved).toBe("ended");
    await k.update(o, id, {
      period: { start: "2026-10-20", end: "2026-10-22" },
    });
    await k.runJob("2026-10-05");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "upcoming",
      nextChangeOn: "2026-10-20",
    });
    expect(await ended(k)).toHaveLength(1);
  });

  it("recordEndedOccasions#9 上のイベント O の、更新後の開催期間が過ぎた / ジョブを実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-04");
    await k.update(o, id, {
      period: { start: "2026-10-20", end: "2026-10-22" },
    });
    await k.runJob("2026-10-05");
    await k.runJob("2026-10-23");
    expect((await k.record(id))?.lastObserved).toBe("ended");
    expect(await ended(k)).toEqual([
      { occasionId: id, observedOn: "2026-10-04" },
      { occasionId: id, observedOn: "2026-10-23" },
    ]);
  });

  it("recordEndedOccasions#10 イベント O の記録の lastObserved は ongoing。updateOccasionContent で開催期間が過去へ更新され、開催の状態が終了になった / 次のジョブを実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-02");
    await k.update(o, id, {
      period: { start: "2026-09-20", end: "2026-09-25" },
    });
    expect(await ended(k)).toEqual([]);
    await k.runJob("2026-10-03");
    expect((await k.record(id))?.lastObserved).toBe("ended");
    expect(await ended(k)).toEqual([
      { occasionId: id, observedOn: "2026-10-03" },
    ]);
  });

  it("recordEndedOccasions#11 イベント O の記録の lastObserved は ended。その後に updateOccasionContent で紹介だけが更新され、イベントの版が進んだ / ジョブを実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-04");
    await k.update(o, id, { description: "紹介だけ更新" });
    const version = (await k.stored(id)).entity.version;
    await k.runJob("2026-10-05");
    expect(await k.record(id)).toMatchObject({
      lastObserved: "ended",
      observedVersion: version,
    });
    expect(await ended(k)).toHaveLength(1);
  });

  it("recordEndedOccasions#12 イベント O の開催期間は 10/1〜10/3。記録の lastObserved は ongoing。10/4 のジョブがページを読んだ後、イベント O の書き込みのスコープを始める前に、updateOccasionContent で開催期間が 10/1〜10/10 に更新されてコミットした / 10/4 のジョブを最後まで実行する", async () => {
    const { k, o, id } = await setUp();
    await k.runJob("2026-10-02");
    k.setToday("2026-10-04");
    let fired = false;
    const postponing: RequestContainer = {
      ...k.container,
      unitOfWorkProvider: {
        run: async (fn) => {
          const result = await k.container.unitOfWorkProvider.run(fn);
          if (!fired) {
            fired = true;
            await k.update(o, id, {
              period: { start: "2026-10-01", end: "2026-10-10" },
            });
          }
          return result;
        },
      },
    };
    const report = await k.runJob(undefined, postponing);
    expect(report.failed).toBe(0);
    expect(await k.record(id)).toEqual({
      occasionId: id,
      lastObserved: "ongoing",
      observedVersion: (await k.stored(id)).entity.version,
      nextChangeOn: "2026-10-11",
    });
    expect(await ended(k)).toEqual([]);
  });

  it("recordEndedOccasions#13 開催の状態が記録と違うイベントが3件あり、そのうち1件の書き込みが失敗する / ジョブを実行する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const [first, failing, third] = await ongoing(k, o, 3);
    if (first === undefined || failing === undefined || third === undefined) {
      throw new Error("occasions");
    }
    k.setToday("2026-10-04");
    const report = await k.runJob(
      undefined,
      failingPuts(k, new Set([failing])),
    );
    expect(report).toMatchObject({ processed: 2, failed: 1 });
    for (const id of [first, third]) {
      expect((await k.record(id))?.lastObserved).toBe("ended");
    }
    expect((await k.record(failing))?.lastObserved).toBe("ongoing");
    expect(
      (await ended(k)).map((p) => (p as { occasionId: string }).occasionId),
    ).toEqual([first, third]);
    await k.runJob();
    expect((await k.record(failing))?.lastObserved).toBe("ended");
    expect(await ended(k)).toHaveLength(3);
  });

  it("recordEndedOccasions#14 開催の状態が記録と違うイベントが2件あり、どちらの書き込みも失敗する / ジョブを実行する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const ids = await ongoing(k, o, 2);
    k.setToday("2026-10-04");
    const report = await k.runJob(undefined, failingPuts(k, new Set(ids)));
    expect(report).toMatchObject({ processed: 0, failed: 2, abandoned: true });
    for (const id of ids) {
      expect((await k.record(id))?.lastObserved).toBe("ongoing");
    }
    expect(await ended(k)).toEqual([]);
    await k.runJob();
    for (const id of ids) {
      expect((await k.record(id))?.lastObserved).toBe("ended");
    }
    expect(await ended(k)).toHaveLength(2);
  });

  it("recordEndedOccasions#15 開催の状態が記録と違うイベントがない / ジョブを実行する", async () => {
    const { k, id } = await setUp();
    await k.runJob("2026-09-30");
    const record = await k.record(id);
    const mark = await k.mark();
    const report = await k.runJob("2026-09-30");
    expect(report).toEqual({
      processed: 0,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
    expect(await k.record(id)).toEqual(record);
    expect(await k.since(mark)).toEqual([]);
  });
});
