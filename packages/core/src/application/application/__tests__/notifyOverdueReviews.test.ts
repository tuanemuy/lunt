import { describe, expect, it } from "vitest";
import { dailyJobs } from "../../workers/dailyJobRegistry";
import {
  notifyOverdueReviews,
  notifyOverdueReviewsJob,
} from "../notifyOverdueReviews";
import { reviewKit } from "./reviewKit";

const DAY = 24 * 60 * 60 * 1000;

describe("notifyOverdueReviews", () => {
  it.todo(
    "notifyOverdueReviews#1 X への所属の申請 b1（10日前から確認中）と、e1 への参加の申請 c1（8日前から確認中）がある。どちらも通知した記録がない / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#2 X への離脱の申請 b2 は、3日前から確認中 / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#3 Y への所属の申請 b3（10日前から確認中）と、情報修正の申請 a1（10日前から確認中）がある / ジョブを実行する",
  );

  it("an operator-seat application under review past the period is not notified", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId } = await k.placeWithPhotos("山田珈琲店", 0);
    const a1 = await k.revise(A, placeId);
    k.clock.advance(10 * DAY);
    const mark = await k.mark();

    const report = await notifyOverdueReviews(k.container, k.clock.now());

    expect(report).toEqual({
      processed: 0,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
    expect(await k.eventsSince(mark)).toEqual([]);
    expect(
      await k.run(({ overdueNoticeLedger }) =>
        overdueNoticeLedger.findByApplicationIds([a1.id]),
      ),
    ).toEqual([]);
  });

  it.todo(
    "notifyOverdueReviews#4 X への申請 b4 は、10日前から差し戻し。X への申請 b5 は、10日前に確認中になり、その後に否認された / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#5 b1 は、前の実行で通知されている。確認中のまま / ジョブをもう一度実行する（同じ日、または翌日）",
  );

  it.todo(
    "notifyOverdueReviews#6 b1 は、通知された後に差し戻され、再提出で確認中に戻り、再提出から8日が過ぎた / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#7 b1 は、通知された後に差し戻され、再提出で確認中に戻り、再提出から2日が過ぎた / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#8 対象の申請 b1 と c1 がある。b1 の記録とドメインイベントの保存が失敗する / ジョブを実行する",
  );

  it.todo(
    "notifyOverdueReviews#9 対象の申請 b1 がある。ジョブが b1 を含むページを読んだ後、b1 の記録の前に、b1 が否認された / ジョブを実行する",
  );

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
