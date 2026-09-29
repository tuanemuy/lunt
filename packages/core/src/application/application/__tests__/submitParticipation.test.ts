import type { ApplicationId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { period } from "../../listing/__tests__/kit";
import { oct, type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

const day = (value: string) => LocalDate.parse(value);

/** A place with its steward `S` and a published, upcoming occasion `e1` with its organizer. */
async function setting(k: StewardSeatKit) {
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const e1 = await k.addOccasion({ name: "秋祭り" });
  await k.organizer(e1, "V");
  return { p1, S, e1 };
}

const expectNoApplication = async (k: StewardSeatKit, id: ApplicationId) =>
  expect(await k.findApp(id)).toBeNull();

describe("submitParticipation", () => {
  it("submitParticipation#1 利用者 S は店舗 p1 の店舗管理者。イベント e1 は公開中で開催前、運営者がいる。p1 の掲載 l1 は公開中で提供中、l2 は公開中で提供開始前、l6 は公開中で提供終了 / S が、l1・l2・l6 と、開催期間内の参加日2日を添えて、p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const l1 = (await k.published(S, p1)).id;
    const l2 = (
      await k.published(S, p1, { offering: period("2026-12-01", null) })
    ).id;
    const l6 = (await k.published(S, p1)).id;
    await k.end(S, l6);
    const mark = await k.mark();

    const c1 = await k.participationApp(S, {
      placeId: p1,
      occasionId: e1,
      listingIds: [l1, l2, l6],
      dates: [oct(2), oct(1)],
    });

    expect(await k.app(c1.id)).toEqual(c1);
    expect(c1.status.kind).toBe("underReview");
    expect(c1.target).toEqual({
      kind: "participation",
      applicant: { kind: "place", placeId: p1 },
      placeId: p1,
      occasionId: e1,
    });
    expect(c1.content).toEqual({
      listingIds: [l1, l2, l6],
      dates: [oct(1), oct(2)],
    });
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: {
          applicationId: c1.id,
          approver: { kind: "steward", target: { kind: "occasion", id: e1 } },
        },
      }),
    ]);
    expect(await k.participation(e1, p1)).toBeNull();
  });

  it("submitParticipation#2 S は p1 の店舗管理者。e1 は公開中で開催中 / S が、掲載も参加日も添えずに、p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    // 「今日」 is 2026-07-10.
    const e1 = await k.addOccasion({
      period: [day("2026-07-01"), day("2026-07-31")],
    });

    const c = await k.participationApp(S, { placeId: p1, occasionId: e1 });

    expect((await k.app(c.id)).status.kind).toBe("underReview");
    expect(c.content).toEqual({ listingIds: [], dates: [] });
  });

  it("submitParticipation#3 p1 の e1 への参加の申請が否認になっている / S が、別の ID で p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const before = await k.participationApp(S, { placeId: p1, occasionId: e1 });
    await k.reject(before.id);

    const again = await k.participationApp(S, { placeId: p1, occasionId: e1 });

    expect(again.id).not.toBe(before.id);
    expect((await k.app(again.id)).status.kind).toBe("underReview");
    expect((await k.app(before.id)).status.kind).toBe("rejected");
  });

  it("submitParticipation#4 利用者 A は p1 の店舗管理者でない。p1 に店舗管理者がいない / A が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const e1 = await k.addOccasion();
    const id = k.newApplicationId();

    await expectCode(
      k.participationApp(A, { placeId: p1, occasionId: e1, id }),
      ForbiddenError,
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitParticipation#5 S は申請の入力の途中で p1 の管理権限を失った / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const id = k.newApplicationId();
    const racing = commitAfter(k.container, () =>
      k.removeSteward(k.ref(p1), S),
    );

    await expectCode(
      k.participationApp(S, {
        placeId: p1,
        occasionId: e1,
        id,
        container: racing,
      }),
      ForbiddenError,
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitParticipation#6 S は p1 の店舗管理者。e1 は終了している / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const e1 = await k.addOccasion({
      period: [day("2026-07-01"), day("2026-07-05")],
    });
    const id = k.newApplicationId();

    await expectCode(
      k.participationApp(S, { placeId: p1, occasionId: e1, id }),
      BusinessRuleError,
      "APPLICATION_OCCASION_NOT_OPEN",
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitParticipation#7 S は p1 の店舗管理者。e1 は中止になっている / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const e1 = await k.addOccasion({ cancelled: true });

    await expectCode(
      k.participationApp(S, { placeId: p1, occasionId: e1 }),
      BusinessRuleError,
      "APPLICATION_OCCASION_NOT_OPEN",
    );
  });

  it("submitParticipation#8 S は p1 の店舗管理者。p1 は e1 に参加中 / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    await k.participate(e1, p1);

    await expectCode(
      k.participationApp(S, { placeId: p1, occasionId: e1 }),
      BusinessRuleError,
      "APPLICATION_ALREADY_PARTICIPATING",
    );
  });

  it("submitParticipation#9 p1 の別の店舗管理者 T が行った、p1 の e1 への参加の申請が差し戻し / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const T = await k.manager(p1, "T");
    const byT = await k.participationApp(T, { placeId: p1, occasionId: e1 });
    await k.sendBack(byT.id);

    await expectCode(
      k.participationApp(S, { placeId: p1, occasionId: e1 }),
      BusinessRuleError,
      "APPLICATION_ALREADY_ACTIVE",
    );
  });

  it("submitParticipation#10 S は p1 の店舗管理者。e1 は公開を取り下げられている / S が p1 の e1 への参加を申請する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const e1 = await k.addOccasion({ state: "unpublished" });

    await expectCode(
      k.participationApp(S, { placeId: p1, occasionId: e1 }),
      BusinessRuleError,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitParticipation#11 S は p1 の店舗管理者。e1 は開催前 / S が、開催期間の外の日付を参加日にして申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const id = k.newApplicationId();

    await expectCode(
      k.participationApp(S, {
        placeId: p1,
        occasionId: e1,
        dates: [oct(1), oct(5)],
        id,
      }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitParticipation#12 S は p1 の店舗管理者。p1 の掲載 l3 は下書き、l4 は一時非公開、l5 は別の店舗の公開中の掲載 / S が、l3、l4、l5 のどれかを添えて申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const l3 = (await k.draft(S, p1)).id;
    const l4 = (await k.published(S, p1)).id;
    await k.unpublish(S, l4);
    const p9 = await k.place("別の店");
    const other = await k.manager(p9, "other");
    const l5 = (await k.published(other, p9)).id;

    for (const listingId of [l3, l4, l5]) {
      const id = k.newApplicationId();
      await expectCode(
        k.participationApp(S, {
          placeId: p1,
          occasionId: e1,
          listingIds: [listingId],
          id,
        }),
        BusinessRuleError,
        "OCCASION_LISTING_NOT_ATTACHABLE",
      );
      await expectNoApplication(k, k.asApplicationId(id));
    }
  });

  it("submitParticipation#13 l1 と参加日を添えた、p1 の e1 への参加の申請 c1 が確認中で保存されている。その後、l1 が一時非公開になり、e1 の開催期間が短くなって参加日が期間外になった / S が、同じ ID c1 と、最初と同じ掲載と参加日で、もう一度申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const l1 = (await k.published(S, p1)).id;
    const id = k.newApplicationId();
    const input = {
      placeId: p1,
      occasionId: e1,
      listingIds: [l1],
      dates: [oct(3)],
      id,
    };
    const c1 = await k.participationApp(S, input);
    await k.unpublish(S, l1);
    await k.setPeriod(e1, [oct(1), oct(2)]);
    const mark = await k.mark();

    expect(await k.participationApp(S, input)).toEqual(c1);
    expect(await k.eventsSince(mark)).toEqual([]);
    expect(await k.app(c1.id)).toEqual(c1);
  });

  it("submitParticipation#14 c1 が確認中で保存されている / S が、同じ ID c1 で、添える掲載の違う入力を送る", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const [l1, l2] = [
      (await k.published(S, p1)).id,
      (await k.published(S, p1)).id,
    ];
    const id = k.newApplicationId();
    const c1 = await k.participationApp(S, {
      placeId: p1,
      occasionId: e1,
      listingIds: [l1],
      id,
    });

    await expectCode(
      k.participationApp(S, {
        placeId: p1,
        occasionId: e1,
        listingIds: [l2],
        id,
      }),
      ConflictError,
    );
    expect(await k.app(c1.id)).toEqual(c1);
  });

  it("compares a resend with its repeats dropped and its days sorted, as the stored details are", async () => {
    const k = await stewardSeatKit();
    const { p1, S, e1 } = await setting(k);
    const l1 = (await k.published(S, p1)).id;
    const id = k.newApplicationId();
    const c1 = await k.participationApp(S, {
      placeId: p1,
      occasionId: e1,
      listingIds: [l1, l1],
      dates: [oct(2), oct(1), oct(2)],
      id,
    });
    expect(c1.content).toEqual({ listingIds: [l1], dates: [oct(1), oct(2)] });

    expect(
      await k.participationApp(S, {
        placeId: p1,
        occasionId: e1,
        listingIds: [l1],
        dates: [oct(1), oct(2)],
        id,
      }),
    ).toEqual(c1);
  });
});
