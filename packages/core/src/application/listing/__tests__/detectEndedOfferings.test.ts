import type { ListingId } from "@repo/core/domain/common/ids";
import type { OfferingPhaseLedger } from "@repo/core/domain/listing/ports/offeringPhaseLedger";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { detectEndedOfferings } from "../detectEndedOfferings";
import { updateListing } from "../updateListing";
import {
  dates,
  type ListingKit,
  listingKit,
  period,
  TODAY_INSTANT,
} from "./kit";

const YESTERDAY = "2026-07-09T03:00:00.000Z";

const run = (k: ListingKit, container: RequestContainer = k.container) =>
  detectEndedOfferings(container, k.clock.now());

/** Runs the job yesterday (the previous run that wrote the record), then comes back to today. */
async function recordedYesterday(k: ListingKit): Promise<void> {
  const now = k.clock.now();
  k.clock.set(YESTERDAY);
  await run(k);
  k.clock.set(now);
}

async function setUp() {
  const k = await listingKit();
  k.clock.set(YESTERDAY);
  const a = await k.place();
  const m = await k.manager(a);
  k.clock.set(TODAY_INSTANT);
  return { k, a, m };
}

async function ended(k: ListingKit) {
  return (await k.events("listing.offering_ended")).map((e) => e.payload);
}

describe("detectEndedOfferings", () => {
  it("detectEndedOfferings#1 公開中の掲載の提供期間の終了日が 2026-07-09。確認記録の段階は available、nextChangeOn は 2026-07-10 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    k.clock.set(YESTERDAY);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-07-09"),
    });
    k.clock.set(TODAY_INSTANT);
    await recordedYesterday(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      nextChangeOn: "2026-07-10",
    });
    const before = await k.stored(listing.id);
    await run(k);
    expect(await k.offeringRecord(listing.id)).toEqual({
      listingId: listing.id,
      phase: "ended",
      observedVersion: before.entity.version,
      nextChangeOn: null,
    });
    expect(await ended(k)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
    const after = await k.stored(listing.id);
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity).toEqual(before.entity);
  });

  it("detectEndedOfferings#2 公開中の掲載の最後の開催日が 2026-07-09。確認記録の段階は available、nextChangeOn は 2026-07-10 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    k.clock.set(YESTERDAY);
    const listing = await k.published(m, a, {
      offering: dates("2026-07-02", "2026-07-09"),
    });
    k.clock.set(TODAY_INSTANT);
    await recordedYesterday(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      nextChangeOn: "2026-07-10",
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "ended",
    });
    expect(await ended(k)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
  });

  it("detectEndedOfferings#3 公開中の掲載を、確認記録の後に店舗管理者が提供終了にした（掲載の版が進んだ）。提供の設定は「設定しない」。確認記録の段階は available / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a);
    await recordedYesterday(k);
    await k.end(m, listing.id);
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "ended",
      observedVersion: (await k.stored(listing.id)).entity.version,
    });
    expect(await ended(k)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
  });

  it("detectEndedOfferings#4 上のどれかの実行が成立している / 同じ日にジョブをもう一度実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    await run(k);
    const record = await k.offeringRecord(listing.id);
    const report = await run(k);
    expect(report.processed).toBe(0);
    expect(await k.offeringRecord(listing.id)).toEqual(record);
    expect(await ended(k)).toHaveLength(1);
  });

  it("detectEndedOfferings#5 公開中で提供中の掲載（終了日 2026-08-31）に、確認記録がない / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period(null, "2026-08-31"),
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      nextChangeOn: "2026-09-01",
    });
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#6 公開中で、終了日 2026-06-30 を過ぎて提供終了の掲載に、確認記録がない / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "ended",
      nextChangeOn: null,
    });
    expect(await ended(k)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
  });

  it("detectEndedOfferings#7 公開中で提供中の掲載（終了日 2026-08-31）の確認記録が available、nextChangeOn は 2026-09-01 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period(null, "2026-08-31"),
    });
    await recordedYesterday(k);
    const record = await k.offeringRecord(listing.id);
    expect(record).toMatchObject({
      phase: "available",
      nextChangeOn: "2026-09-01",
    });
    const report = await run(k);
    expect(report.processed).toBe(0);
    expect(await k.offeringRecord(listing.id)).toEqual(record);
  });

  it("detectEndedOfferings#8 公開中で提供中の掲載の確認記録が available。確認記録の後に、店舗管理者が名称を変えて保存した（版が進んだ） / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a);
    await recordedYesterday(k);
    await k.saveName(m, listing.id, "新しい名称");
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      observedVersion: (await k.stored(listing.id)).entity.version,
    });
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#9 確認記録の段階は ended。確認記録の後に、店舗管理者が提供期間を更新して、掲載は提供中に戻っている / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const photo = await k.photo(m);
    const listing = await k.published(m, a, {
      photos: [photo],
      offering: period(null, "2026-06-30"),
    });
    await recordedYesterday(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "ended",
    });
    const eventsBefore = (await ended(k)).length;
    await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId: listing.id,
        version: (await k.stored(listing.id)).entity.version,
        content: k.content({
          photos: [photo],
          offering: period(null, "2026-08-31"),
        }),
      },
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
    });
    expect(await ended(k)).toHaveLength(eventsBefore);
  });

  it("detectEndedOfferings#10 確認記録の段階は available。確認記録の後に、店舗管理者が掲載を提供終了にし、次の実行までに提供中へ戻した / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a);
    await recordedYesterday(k);
    await k.end(m, listing.id);
    await k.resume(m, listing.id);
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      observedVersion: (await k.stored(listing.id)).entity.version,
    });
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#11 公開中の掲載の開始日が 2026-07-10。確認記録の段階は upcoming、nextChangeOn は 2026-07-10 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period("2026-07-10", null),
    });
    await recordedYesterday(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "upcoming",
      nextChangeOn: "2026-07-10",
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
    });
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#12 公開中の掲載が運営による非公開で、終了日 2026-07-09 を過ぎている。確認記録の段階は available、nextChangeOn は 2026-07-10 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    k.clock.set(YESTERDAY);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-07-09"),
    });
    await k.suspend(await k.operator(), listing.id);
    k.clock.set(TODAY_INSTANT);
    await recordedYesterday(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "available",
      nextChangeOn: "2026-07-10",
    });
    await run(k);
    expect(await k.offeringRecord(listing.id)).toMatchObject({
      phase: "ended",
    });
    expect(await ended(k)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
  });

  it("detectEndedOfferings#13 下書きと一時非公開の掲載の終了日が 2026-07-09 / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const spec = { offering: period(null, "2026-07-09") };
    const draft = await k.draft(m, a, spec);
    const unpublished = await k.published(m, a, spec);
    await k.unpublish(m, unpublished.id);
    await run(k);
    expect(await k.offeringRecord(draft.id)).toBeNull();
    expect(await k.offeringRecord(unpublished.id)).toBeNull();
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#14 ジョブが読んだページにある公開中の掲載が、その掲載を処理する前に一時非公開になった / ジョブがその掲載を処理する", async () => {
    const { k, a, m } = await setUp();
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    let fired = false;
    const unpublishing: RequestContainer = {
      ...k.container,
      unitOfWorkProvider: {
        run: async (fn) => {
          const result = await k.container.unitOfWorkProvider.run(fn);
          if (!fired) {
            fired = true;
            await k.unpublish(m, listing.id);
          }
          return result;
        },
      },
    };
    const report = await run(k, unpublishing);
    expect(report.failed).toBe(0);
    expect(await k.offeringRecord(listing.id)).toBeNull();
    expect(await ended(k)).toEqual([]);
  });

  it("detectEndedOfferings#15 提供終了になった公開中の掲載が3件ある。そのうち1件の書き込みが失敗する / ジョブを実行する", async () => {
    const { k, a, m } = await setUp();
    const spec = { offering: period(null, "2026-06-30") };
    const ids: ListingId[] = [];
    for (let i = 0; i < 3; i++) ids.push((await k.published(m, a, spec)).id);
    const [first, failing, third] = ids;
    if (first === undefined || failing === undefined || third === undefined) {
      throw new Error("listings");
    }
    const failingWrites: RequestContainer = {
      ...k.container,
      unitOfWorkProvider: {
        run: (fn) =>
          k.container.unitOfWorkProvider.run((ctx) => {
            const ledger = ctx.offeringPhaseLedger;
            const wrapped: OfferingPhaseLedger = {
              findPageDrifted: (today, pagination) =>
                ledger.findPageDrifted(today, pagination),
              find: (id) => ledger.find(id),
              remove: (id) => ledger.remove(id),
              record: (entry) =>
                entry.listingId === failing
                  ? Promise.reject(new Error("write failed"))
                  : ledger.record(entry),
            };
            return fn({ ...ctx, offeringPhaseLedger: wrapped });
          }),
      },
    };
    const report = await run(k, failingWrites);
    expect(report).toMatchObject({ processed: 2, failed: 1 });
    for (const id of [first, third]) {
      expect(await k.offeringRecord(id)).toMatchObject({ phase: "ended" });
    }
    expect(await k.offeringRecord(failing)).toBeNull();
    expect(
      (await ended(k))
        .map((p) => (p as { listingId: string }).listingId)
        .sort(),
    ).toEqual([first, third].sort());
    await run(k);
    expect(await k.offeringRecord(failing)).toMatchObject({ phase: "ended" });
    expect(await ended(k)).toHaveLength(3);
  });

  it("fails only the listing whose offering phase record cannot be restored, every run", async () => {
    const { k, a, m } = await setUp();
    k.clock.set(YESTERDAY);
    const ids: ListingId[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        (await k.published(m, a, { offering: period(null, "2026-07-09") })).id,
      );
    }
    k.clock.set(TODAY_INSTANT);
    await recordedYesterday(k);
    const [first, corrupt, third] = ids;
    if (first === undefined || corrupt === undefined || third === undefined) {
      throw new Error("listings");
    }
    k.t.rawSql.exec(
      "UPDATE offering_phase_records SET phase = 'bogus' WHERE listing_id = ?",
      corrupt,
    );

    expect(await run(k)).toMatchObject({ processed: 2, failed: 1 });
    for (const id of [first, third]) {
      expect(await k.offeringRecord(id)).toMatchObject({ phase: "ended" });
    }
    expect(
      (await ended(k))
        .map((p) => (p as { listingId: string }).listingId)
        .sort(),
    ).toEqual([first, third].sort());
    expect(k.t.logger.byLevel("warn")).toMatchObject([
      { meta: { job: "detectEndedOfferings", target: corrupt } },
    ]);
    expect(await run(k)).toMatchObject({ processed: 0, failed: 1 });
  });
});
