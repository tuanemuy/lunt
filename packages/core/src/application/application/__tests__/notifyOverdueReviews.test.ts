import type { OverdueNoticeLedger } from "@repo/core/domain/application/ports/overdueNoticeLedger";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { dailyJobs } from "../../workers/dailyJobRegistry";
import {
  notifyOverdueReviews,
  notifyOverdueReviewsJob,
} from "../notifyOverdueReviews";
import { reviewKit } from "./reviewKit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Region X with steward R, region Y without one, occasion e1 with steward
 * V; place p1 with steward S (it applies as the place), and place p2 with
 * steward S2, affiliated with X.
 */
async function seats() {
  const k = await stewardSeatKit();
  const X = await k.addRegion({ name: "X" });
  const Y = await k.addRegion({ name: "Y" });
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const R = await k.regionSteward(X, "R");
  await k.organizer(e1, "V");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const p2 = await k.place("川沿いの店");
  const S2 = await k.manager(p2, "S2");
  await k.affiliate(p2, X);
  return { k, X, Y, e1, R, p1, S, p2, S2 };
}

type Seats = Awaited<ReturnType<typeof seats>>;

/** b1: p1's affiliation to X, 10 days under review; c1: p1's participation in e1, 8 days. */
async function overdue(s: Seats) {
  const b1 = await s.k.affiliateAsPlace(s.S, { placeId: s.p1, regionId: s.X });
  s.k.passDays(2);
  const c1 = await s.k.participationApp(s.S, {
    placeId: s.p1,
    occasionId: s.e1,
  });
  s.k.passDays(8);
  return { b1, c1 };
}

/** The job on the testcases' 7-day review period, at the clock's now. */
const runJob = (k: StewardSeatKit, container: RequestContainer = k.week) =>
  notifyOverdueReviews(container, k.clock.now());

/** The stored `application.review_period_elapsed` payloads, `pendingSince` read back as a date. */
const elapsed = async (k: StewardSeatKit, mark: number) =>
  (await k.eventsSince(mark, "application.review_period_elapsed")).map((e) => {
    const payload = e.payload as {
      applicationId: string;
      pendingSince: string;
    };
    return { ...payload, pendingSince: new Date(payload.pendingSince) };
  });

const notices = (k: StewardSeatKit, ids: readonly ApplicationId[]) =>
  k.run(({ overdueNoticeLedger }) =>
    overdueNoticeLedger.findByApplicationIds(ids),
  );

const sinceOf = async (k: StewardSeatKit, id: ApplicationId) => {
  const { status } = await k.app(id);
  if (status.kind !== "underReview") throw new Error(`${id} not under review`);
  return status.since;
};

/** A container whose notice ledger refuses to `record` the notices of `failing`. */
function failingRecords(
  k: StewardSeatKit,
  failing: ReadonlySet<ApplicationId>,
): RequestContainer {
  return {
    ...k.week,
    unitOfWorkProvider: {
      run: (fn) =>
        k.week.unitOfWorkProvider.run((ctx) => {
          const ledger = ctx.overdueNoticeLedger;
          const wrapped: OverdueNoticeLedger = {
            findByApplicationIds: (ids) => ledger.findByApplicationIds(ids),
            record: (notice) =>
              failing.has(notice.applicationId)
                ? Promise.reject(new Error("write failed"))
                : ledger.record(notice),
          };
          return fn({ ...ctx, overdueNoticeLedger: wrapped });
        }),
    },
  };
}

describe("notifyOverdueReviews", () => {
  it("notifyOverdueReviews#1 X への所属の申請 b1（10日前から確認中）と、e1 への参加の申請 c1（8日前から確認中）がある。どちらも通知した記録がない / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const { b1, c1 } = await overdue(s);
    const mark = await k.mark();

    const report = await runJob(k);

    expect(report).toMatchObject({ processed: 2, failed: 0 });
    const pending = {
      b1: await sinceOf(k, b1.id),
      c1: await sinceOf(k, c1.id),
    };
    expect(await elapsed(k, mark)).toEqual([
      { applicationId: b1.id, pendingSince: pending.b1 },
      { applicationId: c1.id, pendingSince: pending.c1 },
    ]);
    expect(
      [...(await notices(k, [b1.id, c1.id]))].sort((a, b) =>
        a.applicationId.localeCompare(b.applicationId),
      ),
    ).toEqual(
      [
        { applicationId: b1.id, pendingSince: pending.b1 },
        { applicationId: c1.id, pendingSince: pending.c1 },
      ].sort((a, b) => a.applicationId.localeCompare(b.applicationId)),
    );
    expect(await k.app(b1.id)).toEqual(b1);
    expect(await k.app(c1.id)).toEqual(c1);
  });

  it("notifyOverdueReviews#2 X への離脱の申請 b2 は、3日前から確認中 / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const b2 = await k.leaveAsPlace(s.S2, { placeId: s.p2, regionId: s.X });
    k.passDays(3);
    const mark = await k.mark();

    expect(await runJob(k)).toMatchObject({ processed: 0, failed: 0 });

    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b2.id])).toEqual([]);
  });

  it("notifyOverdueReviews#3 Y への所属の申請 b3（10日前から確認中）と、情報修正の申請 a1（10日前から確認中）がある / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const A = await k.person("A");
    const b3 = await k.affiliateAsPlace(s.S, { placeId: s.p1, regionId: s.Y });
    const { placeId } = await k.placeWithPhotos("駅前の店", 0);
    const a1 = await k.revise(A, placeId);
    k.passDays(10);
    const mark = await k.mark();

    expect(await runJob(k)).toMatchObject({ processed: 0, failed: 0 });

    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b3.id, a1.id])).toEqual([]);
  });

  it("notifyOverdueReviews#4 X への申請 b4 は、10日前から差し戻し。X への申請 b5 は、10日前に確認中になり、その後に否認された / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const b4 = await k.affiliateAsPlace(s.S, { placeId: s.p1, regionId: s.X });
    const b5 = await k.leaveAsPlace(s.S2, { placeId: s.p2, regionId: s.X });
    await k.sendBackAs(s.R, b4.id, undefined, { container: k.week });
    k.passDays(2);
    await k.rejectAs(s.R, b5.id, undefined, { container: k.week });
    k.passDays(8);
    const mark = await k.mark();

    expect(await runJob(k)).toMatchObject({ processed: 0, failed: 0 });

    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b4.id, b5.id])).toEqual([]);
  });

  it("notifyOverdueReviews#5 b1 は、前の実行で通知されている。確認中のまま / ジョブをもう一度実行する（同じ日、または翌日）", async () => {
    const s = await seats();
    const { k } = s;
    const { b1 } = await overdue(s);
    await runJob(k);
    const recorded = await notices(k, [b1.id]);
    const mark = await k.mark();

    await runJob(k);
    k.passDays(1);
    await runJob(k);

    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b1.id])).toEqual(recorded);
  });

  it("notifyOverdueReviews#6 b1 は、通知された後に差し戻され、再提出で確認中に戻り、再提出から8日が過ぎた / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const { b1 } = await overdue(s);
    await runJob(k);
    await k.sendBackAs(s.R, b1.id, undefined, { container: k.week });
    await k.resubmitAs(s.S, b1.id, { kind: "affiliation" });
    const resubmittedAt = await sinceOf(k, b1.id);
    k.passDays(8);
    const mark = await k.mark();

    await runJob(k);

    expect(await elapsed(k, mark)).toEqual([
      { applicationId: b1.id, pendingSince: resubmittedAt },
    ]);
    expect(await notices(k, [b1.id])).toEqual([
      { applicationId: b1.id, pendingSince: resubmittedAt },
    ]);
  });

  it("notifyOverdueReviews#7 b1 は、通知された後に差し戻され、再提出で確認中に戻り、再提出から2日が過ぎた / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const { b1 } = await overdue(s);
    await runJob(k);
    const recorded = await notices(k, [b1.id]);
    await k.sendBackAs(s.R, b1.id, undefined, { container: k.week });
    await k.resubmitAs(s.S, b1.id, { kind: "affiliation" });
    k.passDays(2);
    const mark = await k.mark();

    await runJob(k);

    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b1.id])).toEqual(recorded);
  });

  it("notifyOverdueReviews#8 対象の申請 b1 と c1 がある。b1 の記録とドメインイベントの保存が失敗する / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const { b1, c1 } = await overdue(s);
    const mark = await k.mark();

    const report = await runJob(k, failingRecords(k, new Set([b1.id])));

    expect(report).toMatchObject({ processed: 1, failed: 1, abandoned: false });
    expect(await elapsed(k, mark)).toEqual([
      { applicationId: c1.id, pendingSince: await sinceOf(k, c1.id) },
    ]);
    expect(await notices(k, [b1.id])).toEqual([]);

    const next = await k.mark();
    await runJob(k);
    expect(await elapsed(k, next)).toEqual([
      { applicationId: b1.id, pendingSince: await sinceOf(k, b1.id) },
    ]);
  });

  it("notifyOverdueReviews#9 対象の申請 b1 がある。ジョブが b1 を含むページを読んだ後、b1 の記録の前に、b1 が否認された / ジョブを実行する", async () => {
    const s = await seats();
    const { k } = s;
    const b1 = await k.affiliateAsPlace(s.S, { placeId: s.p1, regionId: s.X });
    k.passDays(10);
    let rejected = false;
    const rejectingAfterRead: RequestContainer = {
      ...k.week,
      applicationReviewDesk: {
        findPageAwaiting: async (desk, pagination) => {
          const page = await k.week.applicationReviewDesk.findPageAwaiting(
            desk,
            pagination,
          );
          if (!rejected && page.items.some((app) => app.id === b1.id)) {
            rejected = true;
            await k.rejectAs(s.R, b1.id, undefined, { container: k.week });
          }
          return page;
        },
      },
    };
    const mark = await k.mark();

    const report = await runJob(k, rejectingAfterRead);

    expect(rejected).toBe(true);
    expect(report).toMatchObject({ failed: 0 });
    expect(await elapsed(k, mark)).toEqual([]);
    expect(await notices(k, [b1.id])).toEqual([]);
    expect((await k.app(b1.id)).status.kind).toBe("rejected");
  });

  it("fails only an application that cannot be restored and notifies the rest, every run", async () => {
    const s = await seats();
    const { k } = s;
    const { b1, c1 } = await overdue(s);
    k.t.rawSql.exec(
      "UPDATE applications SET case_json = '{' WHERE id = ?",
      b1.id,
    );
    const mark = await k.mark();

    const report = await runJob(k);

    expect(report).toMatchObject({ processed: 1, failed: 1 });
    expect(await elapsed(k, mark)).toEqual([
      { applicationId: c1.id, pendingSince: await sinceOf(k, c1.id) },
    ]);
    expect(k.t.logger.byLevel("warn")).toMatchObject([
      { meta: { job: "notifyOverdueReviews", target: b1.id } },
    ]);
    expect(await runJob(k)).toMatchObject({ processed: 1, failed: 1 });
  });

  it("reads the overdue section page after page, notified applications staying in it", async () => {
    const s = await seats();
    const { k } = s;
    const { b1, c1 } = await overdue(s);
    const pages: number[] = [];
    const counting: RequestContainer = {
      ...k.week,
      applicationReviewDesk: {
        findPageAwaiting: (desk, pagination) => {
          pages.push(pagination.page);
          return k.week.applicationReviewDesk.findPageAwaiting(
            desk,
            pagination,
          );
        },
      },
    };

    await runJob(k, counting);
    expect(pages).toEqual([1, 2]);
    expect(
      (await notices(k, [b1.id, c1.id])).map((n) => n.applicationId).sort(),
    ).toEqual([b1.id, c1.id].sort());

    pages.length = 0;
    expect(await runJob(k, counting)).toMatchObject({ processed: 2 });
    expect(pages).toEqual([1, 2]);
  });

  it("notifyOverdueReviews#10 対象の申請がない / ジョブを実行する", async () => {
    const k = await reviewKit();
    const mark = await k.mark();

    const report = await notifyOverdueReviews(k.container, k.clock.now());

    expect(report).toEqual({
      processed: 0,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("runs as one of the daily jobs", () => {
    expect(dailyJobs).toContain(notifyOverdueReviewsJob);
    expect(notifyOverdueReviewsJob.name).toBe("notifyOverdueReviews");
  });
});
