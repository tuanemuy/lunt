import {
  type ApplicationIds,
  applicationIds,
  returned,
  submitted,
  type TestApplication,
  targets,
} from "@repo/core/domain/application/__tests__/fixtures";
import { TestModel } from "@repo/core/domain/application/__tests__/testKinds";
import type { ReviewDesk } from "@repo/core/domain/application/ports/applicationReviewDesk";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import {
  ALL,
  type ApplicationHarness,
  type ApplicationHarnessFactory,
  appointee,
  getApplication,
  idsOf,
  inIdOrder,
  insertApplications,
  insertStewardshipsOf,
  saveApplication,
  scrambledIds,
  steps,
  stewarded,
  storeThrough,
  vacated,
} from "./applicationFixtures";
import { ScopeAbort } from "./fixtures";

const AS_APPROVER: ReviewDesk = { section: "asApprover" };
const overdue = (pendingSinceBefore: Date): ReviewDesk => ({
  section: "asOverdueProxy",
  pendingSinceBefore,
});
const page = (n: number, limit: number): Pagination => ({ page: n, limit });

function awaiting(
  h: ApplicationHarness,
  desk: ReviewDesk,
  pagination: Pagination = ALL,
) {
  return h.reviewDesk.findPageAwaiting(desk, pagination);
}

/**
 * The seats of `spec/testcases/ports/applicationReviewDesk.md`: region X
 * and occasion E have a steward, region Y and occasion F have no stored
 * stewardship, region Z's is `vacant`.
 */
async function seats(h: ApplicationHarness, ids: ApplicationIds) {
  const x = { kind: "region", id: ids.region() } as const;
  const y = { kind: "region", id: ids.region() } as const;
  const z = { kind: "region", id: ids.region() } as const;
  const e = { kind: "occasion", id: ids.occasion() } as const;
  const f = { kind: "occasion", id: ids.occasion() } as const;
  const now = ids.tick();
  await insertStewardshipsOf(
    h,
    stewarded(x, appointee(ids.account()), now),
    vacated(z, appointee(ids.account()), now),
    stewarded(e, appointee(ids.account()), now),
  );
  return { x: x.id, y: y.id, z: z.id, e: e.id, f: f.id };
}

/** The operator-seat kinds, one each (a registration's companion claim aside). */
function operatorSeatApplications(ids: ApplicationIds) {
  const a = ids.account();
  const p = ids.place();
  const [i1, i2, i3, i4, i5] = scrambledIds(ids, 5);
  return [
    submitted(ids, targets.registration(a), ids.tick(), {}, i1),
    submitted(ids, targets.revision(a, p), ids.tick(), {}, i2),
    submitted(ids, targets.stewardship(a, p), ids.tick(), {}, i3),
    submitted(ids, targets.listing(a, p), ids.tick(), {}, i4),
    submitted(
      ids,
      targets.listingRevision(a, ids.listing()),
      ids.tick(),
      {},
      i5,
    ),
  ];
}

/** Neither the id order nor the insertion order is the `since` order. */
function expectSinceOrderIsDistinct(
  bySince: readonly TestApplication[],
  inserted: readonly TestApplication[],
): void {
  expect(idsOf(inIdOrder(bySince))).not.toEqual(idsOf(bySince));
  expect(idsOf(inserted)).not.toEqual(idsOf(bySince));
}

/** `spec/testcases/ports/applicationReviewDesk.md`. */
export function describeApplicationReviewDeskContract(
  makeHarness: ApplicationHarnessFactory,
): void {
  describe("ApplicationReviewDesk contract", () => {
    describe("asApprover", () => {
      it('applicationReviewDesk#1 登録、情報修正、管理権限、掲載、掲載の修正の申請が、それぞれ確認中で保存されている / { section: "asApprover" } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const five = operatorSeatApplications(ids);
        const inserted = [...five].reverse();
        expectSinceOrderIsDistinct(five, inserted);
        await insertApplications(h, ...inserted);
        expect(await awaiting(h, AS_APPROVER)).toEqual({
          items: five,
          count: 5,
        });
      });

      it("applicationReviewDesk#2 登録申請 r（確認中）と、r を参照する併せた管理権限の申請 s（確認中）が保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a), ids.tick());
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
          ids.tick(),
        );
        await insertApplications(h, r, s);
        expect(await awaiting(h, AS_APPROVER)).toEqual({
          items: [r, s],
          count: 2,
        });
      });

      it("applicationReviewDesk#3 Y（管理体制がない）への所属の申請、Z（vacant）への離脱の申請、F（管理体制がない）への参加の申請が、確認中で保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { y, z, f } = await seats(h, ids);
        const absent = [
          submitted(ids, targets.affiliation(ids.place(), y), ids.tick()),
          submitted(ids, targets.leave(ids.place(), z), ids.tick()),
          submitted(ids, targets.participation(ids.place(), f), ids.tick()),
        ];
        await insertApplications(h, ...absent);
        expect(await awaiting(h, AS_APPROVER)).toEqual({
          items: absent,
          count: 3,
        });
      });

      it("applicationReviewDesk#4 X（運営者がいる）への所属の申請と、E（運営者がいる）への参加の申請が、確認中で保存されている。since は十分に古い / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const longAgo = new Date("2020-01-01T00:00:00.000Z");
        const { x, e } = await seats(h, ids);
        await insertApplications(
          h,
          submitted(ids, targets.affiliation(ids.place(), x), longAgo),
          submitted(ids, targets.participation(ids.place(), e), longAgo),
        );
        expect(await awaiting(h, AS_APPROVER)).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#5 情報修正の申請が、差し戻し・承認・否認・取り下げ・失効のそれぞれで保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        for (const step of [
          steps.returned(ids.tick()),
          steps.approved(ids.tick()),
          steps.rejected(ids.tick()),
          steps.withdrawn(ids.tick()),
          steps.lapsed(ids.tick()),
        ]) {
          await storeThrough(
            h,
            submitted(ids, targets.revision(ids.account(), ids.place())),
            step,
          );
        }
        expect(await awaiting(h, AS_APPROVER)).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#6 情報修正の申請が2件、同じ since の確認中で保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const at = ids.tick();
        const two = [
          submitted(ids, targets.revision(ids.account(), ids.place()), at),
          submitted(ids, targets.revision(ids.account(), ids.place()), at),
        ];
        await insertApplications(h, ...[...two].reverse());
        expect((await awaiting(h, AS_APPROVER)).items).toEqual(two);
      });

      it("applicationReviewDesk#7 差し戻しの後に再提出された情報修正の申請 a1（since は t3、submittedAt は t1）と、確認中の掲載の申請 a2（since は t2）が保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const [t1, t2, t3] = [ids.tick(), ids.tick(), ids.tick()];
        const a1 = await storeThrough(
          h,
          submitted(ids, targets.revision(ids.account(), ids.place()), t1),
          steps.returned(t2),
          steps.resubmitted(t3),
        );
        const a2 = submitted(
          ids,
          targets.listing(ids.account(), ids.place()),
          t2,
        );
        await insertApplications(h, a2);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([a2, a1]);
      });

      it("applicationReviewDesk#8 承認者の席が operator の確認中の申請がなく、管理者不在の地域・イベントへの確認中の申請もない / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x, e } = await seats(h, ids);
        await insertApplications(
          h,
          submitted(ids, targets.affiliation(ids.place(), x)),
          submitted(ids, targets.participation(ids.place(), e)),
        );
        expect(await awaiting(h, AS_APPROVER)).toEqual({ items: [], count: 0 });
      });
    });

    describe("asOverdueProxy", () => {
      it("applicationReviewDesk#9 X への所属の申請 a1（since は t1）、E への参加の申請 p1（since は t2）、X への離脱の申請 a2（since は t4）が、確認中で保存されている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x, e } = await seats(h, ids);
        const [t1, t2, t3, t4] = [
          ids.tick(),
          ids.tick(),
          ids.tick(),
          ids.tick(),
        ];
        const [largest, middle, smallest] = scrambledIds(ids, 3)
          .slice()
          .sort()
          .reverse();
        const a1 = submitted(
          ids,
          targets.affiliation(ids.place(), x),
          t1,
          {},
          largest,
        );
        const p1 = submitted(
          ids,
          targets.participation(ids.place(), e),
          t2,
          {},
          smallest,
        );
        const a2 = submitted(
          ids,
          targets.leave(ids.place(), x),
          t4,
          {},
          middle,
        );
        expectSinceOrderIsDistinct([a1, p1], [p1, a1]);
        await insertApplications(h, p1, a2, a1);
        expect(await awaiting(h, overdue(t3))).toEqual({
          items: [a1, p1],
          count: 2,
        });
      });

      it("applicationReviewDesk#10 X への所属の申請が、since が t3 ちょうどの確認中で保存されている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x } = await seats(h, ids);
        const t3 = ids.tick();
        const app = submitted(ids, targets.affiliation(ids.place(), x), t3);
        await insertApplications(h, app);
        expect((await awaiting(h, overdue(t3))).items).toEqual([app]);
      });

      it("applicationReviewDesk#11 Y（管理体制がない）と Z（vacant）への、since が t1 の確認中の申請が保存されている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { y, z } = await seats(h, ids);
        const [t1, , t3] = [ids.tick(), ids.tick(), ids.tick()];
        await insertApplications(
          h,
          submitted(ids, targets.affiliation(ids.place(), y), t1),
          submitted(ids, targets.leave(ids.place(), z), t1),
        );
        expect(await awaiting(h, overdue(t3))).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#12 情報修正の申請が、since が t1 の確認中で保存されている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const [t1, , t3] = [ids.tick(), ids.tick(), ids.tick()];
        await insertApplications(
          h,
          submitted(ids, targets.revision(ids.account(), ids.place()), t1),
        );
        expect(await awaiting(h, overdue(t3))).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#13 X への所属の申請が、since が t1 の差し戻しと、since が t1 だった承認で保存されている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x } = await seats(h, ids);
        const [t1, t2, t3] = [ids.tick(), ids.tick(), ids.tick()];
        await storeThrough(
          h,
          submitted(ids, targets.affiliation(ids.place(), x), t1),
          steps.returned(t2),
        );
        await storeThrough(
          h,
          submitted(ids, targets.affiliation(ids.place(), x), t1),
          steps.approved(t2),
        );
        expect(await awaiting(h, overdue(t3))).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#14 X への申請が、最初の確認中（since は t1）から差し戻され、再提出で確認中（since は t4）に戻っている / pendingSinceBefore: t3 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x } = await seats(h, ids);
        const [t1, t2, t3, t4] = [
          ids.tick(),
          ids.tick(),
          ids.tick(),
          ids.tick(),
        ];
        await storeThrough(
          h,
          submitted(ids, targets.affiliation(ids.place(), x), t1),
          steps.returned(t2),
          steps.resubmitted(t4),
        );
        expect(await awaiting(h, overdue(t3))).toEqual({ items: [], count: 0 });
      });

      it("applicationReviewDesk#15 確認中の申請が、X・Y・Z・E・F への申請と、承認者の席が operator の申請を含めて保存されている / asApprover と、どの申請の since よりも後の pendingSinceBefore の asOverdueProxy を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x, y, z, e, f } = await seats(h, ids);
        const all = [
          submitted(ids, targets.affiliation(ids.place(), x), ids.tick()),
          submitted(ids, targets.leave(ids.place(), y), ids.tick()),
          submitted(ids, targets.affiliation(ids.place(), z), ids.tick()),
          submitted(ids, targets.participation(ids.place(), e), ids.tick()),
          submitted(ids, targets.participation(ids.place(), f), ids.tick()),
          ...operatorSeatApplications(ids),
        ];
        await insertApplications(h, ...all);
        const later = ids.tick();
        const approver = idsOf((await awaiting(h, AS_APPROVER)).items);
        const proxy = idsOf((await awaiting(h, overdue(later))).items);
        expect(approver.filter((id) => proxy.includes(id))).toEqual([]);
        expect([...approver, ...proxy].sort()).toEqual(idsOf(all).sort());
        expect(proxy).toHaveLength(2);
      });
    });

    describe("管理体制の変化", () => {
      it("applicationReviewDesk#16 Y（管理体制がない）への確認中の申請が asApprover に現れている / Y に運営者を置く管理体制を insert してコミットし、asApprover と asOverdueProxy（pendingSinceBefore は申請の since 以降）を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const y = { kind: "region", id: ids.region() } as const;
        const app = submitted(ids, targets.affiliation(ids.place(), y.id));
        await insertApplications(h, app);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([app]);
        await insertStewardshipsOf(
          h,
          stewarded(y, appointee(ids.account()), ids.tick()),
        );
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([]);
        expect((await awaiting(h, overdue(app.status.since))).items).toEqual([
          app,
        ]);
      });

      it("applicationReviewDesk#17 X（運営者がいる）への確認中の申請が asOverdueProxy に現れている / X の管理体制を vacant にして save してコミットし、両方を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const x = { kind: "region", id: ids.region() } as const;
        const steward = appointee(ids.account());
        await insertStewardshipsOf(h, stewarded(x, steward, ids.tick()));
        const app = submitted(ids, targets.affiliation(ids.place(), x.id));
        await insertApplications(h, app);
        const cutoff = ids.tick();
        expect((await awaiting(h, overdue(cutoff))).items).toEqual([app]);
        await h.run(async ({ stewardshipRepository }) => {
          const read = await stewardshipRepository.findById(x);
          if (read === null) throw new Error("missing stewardship");
          await stewardshipRepository.save(
            Stewardship.removeSteward(
              read.entity,
              steward.accountId,
              "resigned",
              ids.tick(),
            ).entity,
            read.expectedVersion,
          );
        });
        expect((await awaiting(h, overdue(cutoff))).items).toEqual([]);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([app]);
      });
    });

    describe("ページング", () => {
      async function approverWith(n: number) {
        const h = await makeHarness();
        const ids = applicationIds();
        const apps = scrambledIds(ids, n).map((id) =>
          submitted(
            ids,
            targets.revision(ids.account(), ids.place()),
            ids.tick(),
            {},
            id,
          ),
        );
        const inserted = [...apps].reverse();
        if (n >= 3) expectSinceOrderIsDistinct(apps, inserted);
        await insertApplications(h, ...inserted);
        return { h, apps };
      }

      it("applicationReviewDesk#18 asApprover に当たる申請が1件 / page: 1、limit: 10 で呼ぶ", async () => {
        const { h, apps } = await approverWith(1);
        expect(await awaiting(h, AS_APPROVER, page(1, 10))).toEqual({
          items: apps,
          count: 1,
        });
      });

      it("applicationReviewDesk#19 asApprover に当たる申請が3件 / page: 1、limit: 3 で呼ぶ", async () => {
        const { h, apps } = await approverWith(3);
        expect(await awaiting(h, AS_APPROVER, page(1, 3))).toEqual({
          items: apps,
          count: 3,
        });
      });

      it("applicationReviewDesk#20 asApprover に当たる申請が5件 / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const { h, apps } = await approverWith(5);
        expect(await awaiting(h, AS_APPROVER, page(1, 3))).toEqual({
          items: apps.slice(0, 3),
          count: 5,
        });
        expect(await awaiting(h, AS_APPROVER, page(2, 3))).toEqual({
          items: apps.slice(3),
          count: 5,
        });
      });

      it("applicationReviewDesk#21 asApprover に当たる申請が5件 / page: 3、limit: 3 で呼ぶ", async () => {
        const { h } = await approverWith(5);
        expect(await awaiting(h, AS_APPROVER, page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });

      it("applicationReviewDesk#22 asOverdueProxy に当たる申請が5件 / limit: 3 で、page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const { x } = await seats(h, ids);
        const apps: readonly TestApplication[] = scrambledIds(ids, 5).map(
          (id) =>
            submitted(
              ids,
              targets.affiliation(ids.place(), x),
              ids.tick(),
              {},
              id,
            ),
        );
        const inserted = [...apps].reverse();
        expectSinceOrderIsDistinct(apps, inserted);
        await insertApplications(h, ...inserted);
        const cutoff = ids.tick();
        expect(await awaiting(h, overdue(cutoff), page(1, 3))).toEqual({
          items: apps.slice(0, 3),
          count: 5,
        });
        expect(await awaiting(h, overdue(cutoff), page(2, 3))).toEqual({
          items: apps.slice(3),
          count: 5,
        });
        expect(await awaiting(h, overdue(cutoff), page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });
    });

    describe("可視性", () => {
      it("applicationReviewDesk#23 申請が保存されていない / UnitOfWork の中で、情報修正の申請を insert してコミットし、直後に asApprover を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([app]);
      });

      it("applicationReviewDesk#24 確認中の申請が asApprover に現れている / UnitOfWork の中で、否認にした申請を save してコミットし、直後に呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([app]);
        const read = await getApplication(h, app.id);
        await saveApplication(
          h,
          steps.rejected(ids.tick())(read.entity),
          read.expectedVersion,
        );
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([]);
      });

      it("applicationReviewDesk#25 確認中の申請が asApprover に現れている / UnitOfWork の中で、差し戻しにした申請を save してコミットし、続けて、再提出した申請を save してコミットし、それぞれの直後に呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        const read = await getApplication(h, app.id);
        const back = returned(
          TestModel.Application.requireUnderReview(read.entity),
          ids.tick(),
        );
        await saveApplication(h, back, read.expectedVersion);
        expect((await awaiting(h, AS_APPROVER)).items).toEqual([]);
        const again = await getApplication(h, app.id);
        const resubmitted = steps.resubmitted(ids.tick())(again.entity);
        await saveApplication(h, resubmitted, again.expectedVersion);
        const result = await awaiting(h, AS_APPROVER);
        expect(result.items).toEqual([resubmitted]);
        expect(result.items[0]?.status.since).not.toEqual(app.status.since);
      });

      it("applicationReviewDesk#26 申請が保存されていない / UnitOfWork の中で申請を insert した後に、fn が例外を投げる。その後に呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await expect(
          h.run(async ({ applicationRepository }) => {
            await applicationRepository.insert(app);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await awaiting(h, AS_APPROVER)).toEqual({ items: [], count: 0 });
      });
    });
  });
}
