import type { ListingId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { Version } from "@repo/core/domain/common/version";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { OfferingPhase } from "@repo/core/domain/listing/offering";
import type { OfferingPhaseRecord } from "@repo/core/domain/listing/offeringWatch";
import { describe, expect, it } from "vitest";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  day,
  deleteListing,
  getListing,
  insertListings,
  listingFactory,
  page,
  recordPhase,
  saveListing,
  TODAY,
} from "./listingFixtures";

type H = ConformanceHarness;

const drifted = (
  h: H,
  today: LocalDate = TODAY,
  pagination: Pagination = page(1),
) =>
  h.uow.run(({ offeringPhaseLedger }) =>
    offeringPhaseLedger.findPageDrifted(today, pagination),
  );

const findRecord = (h: H, id: ListingId) =>
  h.uow.run(({ offeringPhaseLedger }) => offeringPhaseLedger.find(id));

const removeRecord = (h: H, id: ListingId) =>
  h.uow.run(({ offeringPhaseLedger }) => offeringPhaseLedger.remove(id));

/** `[listing id, recorded phase]` per drifted item, in the returned order. */
const entries = async (
  h: H,
  today: LocalDate = TODAY,
  pagination: Pagination = page(1),
) =>
  (await drifted(h, today, pagination)).items.map(
    (item) => [item.listing.id, item.recorded] as const,
  );

/** A record of `listing` at its current stored version. */
async function currentRecord(
  h: H,
  listing: Listing,
  phase: OfferingPhase,
  nextChangeOn: string | null,
): Promise<OfferingPhaseRecord> {
  const stored = await getListing(h, listing.id);
  return {
    listingId: listing.id,
    phase,
    observedVersion: stored.entity.version,
    nextChangeOn: nextChangeOn === null ? null : day(nextChangeOn),
  };
}

async function recordCurrent(
  h: H,
  listing: Listing,
  phase: OfferingPhase,
  nextChangeOn: string | null,
): Promise<OfferingPhaseRecord> {
  const entry = await currentRecord(h, listing, phase, nextChangeOn);
  await recordPhase(h, entry);
  return entry;
}

/** `spec/testcases/ports/offeringPhaseLedger.md`. */
export function describeOfferingPhaseLedgerContract(
  makeHarness: HarnessFactory,
): void {
  describe("OfferingPhaseLedger contract", () => {
    describe("findPageDrifted", () => {
      it("offeringPhaseLedger#1 公開中の掲載 X があり、確認記録がない / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const result = await drifted(h);
        expect(result.items).toEqual([{ listing: x, recorded: null }]);
        expect(result.count).toBe(1);
      });

      it('offeringPhaseLedger#2 公開中の掲載 X に、現在の版の記録（phase: "available"、nextChangeOn: null）がある / 読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        expect(await drifted(h)).toEqual({ items: [], count: 0 });
      });

      it('offeringPhaseLedger#3 公開中の掲載 X に、現在の版の記録（phase: "available"、nextChangeOn: 2026-07-11）がある / 読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", "2026-07-11");
        expect(await drifted(h)).toEqual({ items: [], count: 0 });
      });

      it('offeringPhaseLedger#4 公開中の掲載 X に、現在の版の記録（phase: "available"、nextChangeOn: 2026-07-10）がある / 読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", "2026-07-10");
        const result = await drifted(h);
        expect(result.items).toEqual([{ listing: x, recorded: "available" }]);
        expect(result.items[0]?.listing.publication.status).toBe("published");
      });

      it('offeringPhaseLedger#5 公開中の掲載 X に、現在の版の記録（phase: "upcoming"、nextChangeOn: 2026-07-05）がある / 読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "upcoming", "2026-07-05");
        expect(await entries(h)).toEqual([[x.id, "upcoming"]]);
      });

      it('offeringPhaseLedger#6 公開中の掲載 X に、現在の版の記録（phase: "available"、nextChangeOn: 2026-07-15）がある / today に 2026-07-10 と 2026-07-15 を渡して読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", "2026-07-15");
        expect(await entries(h, day("2026-07-10"))).toEqual([]);
        expect(await entries(h, day("2026-07-15"))).toEqual([
          [x.id, "available"],
        ]);
      });

      it('offeringPhaseLedger#7 公開中の掲載 X に、現在の版の記録（phase: "available"、nextChangeOn: null）がある。その後に X を save して版が進んだ / 読む', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        const read = await getListing(h, x.id);
        await saveListing(h, f.suspended(read.entity), read.expectedVersion);
        expect(await entries(h)).toEqual([[x.id, "available"]]);
      });

      it("offeringPhaseLedger#8 下書きと一時非公開の掲載があり、確認記録がない。一時非公開の掲載のもう1件には、nextChangeOn が今日以前の記録がある / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const draft = f.draft(p);
        const unpublished = f.unpublished(p);
        const recorded = f.unpublished(p);
        await insertListings(h, draft, unpublished, recorded);
        await recordCurrent(h, recorded, "available", "2026-07-01");
        expect(await drifted(h)).toEqual({ items: [], count: 0 });
      });

      it("offeringPhaseLedger#9 公開中の掲載 X が運営による非公開で、確認記録がない / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.suspended(f.published(f.place()));
        await insertListings(h, x);
        expect(await entries(h)).toEqual([[x.id, null]]);
      });

      it("offeringPhaseLedger#10 公開中の掲載 X に、nextChangeOn が今日以前の記録があり、X を ListingRepository.delete で削除している / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", "2026-07-01");
        await deleteListing(
          h,
          x.id,
          (await getListing(h, x.id)).expectedVersion,
        );
        expect(await drifted(h)).toEqual({ items: [], count: 0 });
      });

      it("offeringPhaseLedger#11 公開中で確認記録のない掲載が複数ある / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = [f.published(p), f.published(p), f.published(p)];
        await insertListings(h, ...[...listings].reverse());
        expect((await entries(h)).map(([id]) => id)).toEqual(
          listings.map((l) => l.id).sort(),
        );
      });

      it("offeringPhaseLedger#12 公開中の掲載 X が返る状態にある / X の現在の版の記録（nextChangeOn: null）を record してから読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        expect(await entries(h)).toEqual([[x.id, null]]);
        await recordCurrent(h, x, "available", null);
        expect(await entries(h)).toEqual([]);
      });

      it("offeringPhaseLedger#13 当たる掲載がない / 読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        await insertListings(h, f.draft(f.place()));
        expect(await drifted(h)).toEqual({ items: [], count: 0 });
      });

      it("offeringPhaseLedger#14 当たる掲載が1件ある / page: 1、limit: 10 で読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const result = await drifted(h, TODAY, page(1, 10));
        expect(result.items.map((i) => i.listing.id)).toEqual([x.id]);
        expect(result.count).toBe(1);
      });

      it("offeringPhaseLedger#15 当たる掲載が5件ある / limit: 5 で page: 1 を、limit: 3 で page: 1・page: 2・page: 3 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = Array.from({ length: 5 }, () => f.published(p));
        await insertListings(h, ...listings);
        const ordered = listings.map((l) => l.id).sort();
        const all = await drifted(h, TODAY, page(1, 5));
        const pages = await Promise.all(
          [1, 2, 3].map((n) => drifted(h, TODAY, page(n, 3))),
        );
        expect(all.items.map((i) => i.listing.id)).toEqual(ordered);
        expect(pages.map((r) => r.items.map((i) => i.listing.id))).toEqual([
          ordered.slice(0, 3),
          ordered.slice(3),
          [],
        ]);
        expect([all, ...pages].map((r) => r.count)).toEqual([5, 5, 5, 5]);
      });

      it("offeringPhaseLedger#16 当たる掲載が5件ある / limit: 3 で page: 1 を読み、返った3件の現在の版の記録（nextChangeOn: null）を record し、もう一度 page: 1 を読む", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const listings = Array.from({ length: 5 }, () => f.published(p));
        await insertListings(h, ...listings);
        const first = await drifted(h, TODAY, page(1, 3));
        for (const item of first.items) {
          await recordCurrent(h, item.listing, "available", null);
        }
        const again = await drifted(h, TODAY, page(1, 3));
        expect(again.items.map((i) => i.listing.id)).toEqual(
          listings
            .map((l) => l.id)
            .sort()
            .slice(3),
        );
        expect(again.count).toBe(2);
      });
    });

    describe("find", () => {
      it("offeringPhaseLedger#17 掲載 X に確認記録がない / find(X)", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        expect(await findRecord(h, x.id)).toBeNull();
      });

      it("offeringPhaseLedger#18 掲載 X の記録を record した後に、X を ListingRepository.delete で削除している / find(X)", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        await deleteListing(
          h,
          x.id,
          (await getListing(h, x.id)).expectedVersion,
        );
        expect(await findRecord(h, x.id)).toBeNull();
      });

      it('offeringPhaseLedger#19 掲載 X の記録（phase: "ended"、nextChangeOn: null）を record している / find(X)', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const entry = await recordCurrent(h, x, "ended", null);
        expect(await findRecord(h, x.id)).toEqual(entry);
      });
    });

    describe("record", () => {
      it('offeringPhaseLedger#20 公開中の掲載 X に確認記録がない / X の現在の版の記録（phase: "ended"、nextChangeOn: 2026-07-10）を record する', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const entry = await recordCurrent(h, x, "ended", "2026-07-10");
        expect(await findRecord(h, x.id)).toEqual(entry);
        expect(await entries(h)).toEqual([[x.id, "ended"]]);
      });

      it('offeringPhaseLedger#21 公開中の掲載 X に、phase: "available" の記録がある / X の現在の版の記録を phase: "ended"、nextChangeOn: 2026-07-10 で record する', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        const entry = await recordCurrent(h, x, "ended", "2026-07-10");
        expect(await findRecord(h, x.id)).toEqual(entry);
        expect(await entries(h)).toEqual([[x.id, "ended"]]);
      });

      it("offeringPhaseLedger#22 掲載 X を ListingRepository.findById で読み、expectedVersion を得ている / X の記録を record した後に、その expectedVersion で X を save する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        await recordCurrent(h, x, "available", null);
        const next = f.suspended(read.entity);
        await saveListing(h, next, read.expectedVersion);
        expect((await getListing(h, x.id)).entity).toEqual(next);
      });

      it('offeringPhaseLedger#23 掲載 X に確認記録がある / 2つの record（phase: "available" と phase: "ended"）を続けて行う', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "upcoming", null);
        const available = await currentRecord(h, x, "available", null);
        const ended = await currentRecord(h, x, "ended", null);
        await recordPhase(h, available);
        await recordPhase(h, ended);
        expect(await findRecord(h, x.id)).toEqual(ended);
      });

      it('offeringPhaseLedger#24 公開中の掲載 X を ListingRepository.delete で削除している / X の記録（phase: "ended"、nextChangeOn: null）を record する', async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const read = await getListing(h, x.id);
        await deleteListing(h, x.id, read.expectedVersion);
        await recordPhase(h, {
          listingId: x.id,
          phase: "ended",
          observedVersion: read.entity.version,
          nextChangeOn: null,
        });
        expect(await findRecord(h, x.id)).toBeNull();
        expect(await entries(h)).toEqual([]);
      });

      it("offeringPhaseLedger#25 どの掲載も持たない ListingId Z / Z の記録（observedVersion は Version.initial()）を record する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const z = f.listingId();
        await recordPhase(h, {
          listingId: z,
          phase: "available",
          observedVersion: Version.initial(),
          nextChangeOn: null,
        });
        expect(await findRecord(h, z)).toBeNull();
        expect(await entries(h)).toEqual([]);
      });
    });

    describe("remove", () => {
      it("offeringPhaseLedger#26 公開中の掲載 X に、現在の版の記録（nextChangeOn: null）がある / X の記録を remove する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        await removeRecord(h, x.id);
        expect(await entries(h)).toEqual([[x.id, null]]);
        expect(await findRecord(h, x.id)).toBeNull();
      });

      it("offeringPhaseLedger#27 掲載 X に確認記録がない / X の記録を remove する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await expect(removeRecord(h, x.id)).resolves.toBeUndefined();
      });

      it("offeringPhaseLedger#28 掲載 X と Y に確認記録がある / X の記録を remove する", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const p = f.place();
        const [x, y] = [f.published(p), f.published(p)];
        await insertListings(h, x, y);
        await recordCurrent(h, x, "available", null);
        const yEntry = await recordCurrent(h, y, "ended", null);
        await removeRecord(h, x.id);
        expect(await findRecord(h, y.id)).toEqual(yEntry);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("offeringPhaseLedger#29 公開中の掲載 X に確認記録がない / UnitOfWorkProvider.run の中で X の現在の版の記録（nextChangeOn: null）を record し、コミットする", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const entry = await currentRecord(h, x, "available", null);
        await h.uow.run(({ offeringPhaseLedger }) =>
          offeringPhaseLedger.record(entry),
        );
        expect(await entries(h)).toEqual([]);
      });

      it("offeringPhaseLedger#30 公開中の掲載 X に確認記録がない / run の中で X の現在の版の記録を record した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        const entry = await currentRecord(h, x, "available", null);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ offeringPhaseLedger }) => {
            await offeringPhaseLedger.record(entry);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findRecord(h, x.id)).toBeNull();
        expect(await entries(h)).toEqual([[x.id, null]]);
      });

      it("offeringPhaseLedger#31 公開中の掲載 X に、現在の版の記録（nextChangeOn: null）がある / run の中で X の記録を remove した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ offeringPhaseLedger }) => {
            await offeringPhaseLedger.remove(x.id);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await entries(h)).toEqual([]);
      });

      it("offeringPhaseLedger#32 公開中の掲載 X に、現在の版の記録（nextChangeOn: null）がある / run の中で X を ListingRepository.delete で削除し、X の記録を remove して、コミットする", async () => {
        const h = await makeHarness();
        const f = listingFactory();
        const x = f.published(f.place());
        await insertListings(h, x);
        await recordCurrent(h, x, "available", null);
        const read = await getListing(h, x.id);
        await h.uow.run(async ({ listingRepository, offeringPhaseLedger }) => {
          await listingRepository.delete(x.id, read.expectedVersion);
          await offeringPhaseLedger.remove(x.id);
        });
        expect(
          await h.uow.run(({ listingRepository }) =>
            listingRepository.findById(x.id),
          ),
        ).toBeNull();
        expect(await findRecord(h, x.id)).toBeNull();
        expect(await entries(h)).toEqual([]);
      });
    });
  });
}
