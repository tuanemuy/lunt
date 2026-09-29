import type { LocalDate } from "@repo/core/domain/common/localDate";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit } from "./participationKit";

const CHANGED = "occasion.participation_changed";

/**
 * 共通の前提: P takes part in O (10/1〜10/3). P's L1・L2 published and
 * available, L3 upcoming, L4 a draft, L5 ended, L6 一時非公開; M1 is
 * another place's published, available listing.
 */
async function setup(initial: Readonly<{ dates?: readonly LocalDate[] }> = {}) {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const p = await k.place();
  const m = await k.manager(p, "steward");
  const l1 = (await k.published(m, p)).id;
  const l2 = (await k.published(m, p)).id;
  const l3 = (await k.upcoming(m, p)).id;
  const l4 = (await k.draft(m, p)).id;
  const l5 = (await k.ended(m, p)).id;
  const l6 = (await k.unpublished(m, p)).id;
  const q = await k.place();
  const mq = await k.manager(q);
  const m1 = (await k.published(mq, q)).id;
  const pair = { occasionId: o, placeId: p };
  await k.approved(o, p, {
    listingIds: [l1],
    dates: initial.dates ?? [oct(1)],
  });
  return { k, o, organizer, p, m, l1, l2, l3, l4, l5, l6, m1, pair };
}

describe("changeParticipationByPlace", () => {
  it("changeParticipationByPlace#1 操作する人は店舗 P の店舗管理者。参加内容は、添えた掲載 L1、参加日 10/1 / 添える掲載を L2、L1 の順に、参加日を 10/3、10/2 にして保存する", async () => {
    const { k, o, p, m, l1, l2, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    const listingsBefore = [
      (await k.stored(l1)).entity,
      (await k.stored(l2)).entity,
    ];
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const view = await k.byPlace(m, pair, {
      listingIds: [l2, l1],
      dates: [oct(3), oct(2)],
    });
    const after = (await k.storedParticipation(pair)).entity;
    expect(after.details).toEqual({
      listingIds: [l2, l1],
      dates: [oct(2), oct(3)],
    });
    expect(after.version).toBe(Version.next(before.version));
    expect(view.dates).toEqual([oct(2), oct(3)]);
    expect((await k.events(CHANGED)).map((e) => e.payload)).toEqual([
      { occasionId: o, placeId: p, changedBy: "place" },
    ]);
    expect([(await k.stored(l1)).entity, (await k.stored(l2)).entity]).toEqual(
      listingsBefore,
    );
    expect(
      (await k.run(({ placeRepository }) => placeRepository.findById(p)))
        ?.entity,
    ).toEqual(placeBefore?.entity);
  });

  it("changeParticipationByPlace#2 操作する人は店舗 P の店舗管理者 / 提供開始前の掲載 L3 を添えて保存する", async () => {
    const { k, m, l3, pair } = await setup();
    await k.byPlace(m, pair, { listingIds: [l3] });
    expect(
      (await k.storedParticipation(pair)).entity.details.listingIds,
    ).toEqual([l3]);
  });

  it("changeParticipationByPlace#3 操作する人は店舗 P の店舗管理者 / 掲載も参加日も空にして保存する", async () => {
    const { k, m, pair } = await setup();
    await k.byPlace(m, pair, {});
    expect((await k.storedParticipation(pair)).entity.details).toEqual({
      listingIds: [],
      dates: [],
    });
  });

  it("changeParticipationByPlace#4 店舗 P の参加は、店舗管理者のいなかった時期に addParticipationDirectly で成立した。その後に就任した店舗管理者が操作する / 添える掲載と参加日を変更して保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const organizer = await k.organizer(o);
    const p = await k.place();
    const op = await k.operator();
    const l1 = (await k.published(op, p)).id;
    const pair = { occasionId: o, placeId: p };
    await k.add(organizer, pair, { dates: [oct(1)] });
    const m = await k.manager(p);
    await k.byPlace(m, pair, { listingIds: [l1], dates: [oct(2)] });
    expect((await k.storedParticipation(pair)).entity.details).toEqual({
      listingIds: [l1],
      dates: [oct(2)],
    });
  });

  it("changeParticipationByPlace#5 操作する人は店舗 P の店舗管理者。イベント O は公開の取り下げ中で、開催の状態は終了 / 参加日を 10/2 に変更して保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion({ state: "unpublished" });
    const p = await k.place();
    const m = await k.manager(p);
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p, { dates: [oct(1)] });
    k.clock.set("2026-10-10T03:00:00.000Z");
    await k.byPlace(m, pair, { dates: [oct(2)] });
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(2),
    ]);
  });

  it("changeParticipationByPlace#6 操作する人は店舗 P の店舗管理者。参加内容は、添えた掲載 L6（添えた後に一時非公開になった） / 添える掲載を L6、L1 にして保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const p = await k.place();
    const m = await k.manager(p);
    const l1 = (await k.published(m, p)).id;
    const l6 = (await k.published(m, p)).id;
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p, { listingIds: [l6] });
    await k.unpublish(m, l6);
    await k.byPlace(m, pair, { listingIds: [l6, l1] });
    expect(
      (await k.storedParticipation(pair)).entity.details.listingIds,
    ).toEqual([l6, l1]);
  });

  it("changeParticipationByPlace#7 操作する人は店舗 P の店舗管理者。参加内容に L5 はない / 提供終了の掲載 L5 を新しく添えて保存する", async () => {
    const { k, m, l1, l5, pair } = await setup();
    await k.byPlace(m, pair, { listingIds: [l1, l5] });
    expect(
      (await k.storedParticipation(pair)).entity.details.listingIds,
    ).toEqual([l1, l5]);
  });

  it("changeParticipationByPlace#8 操作する人は店舗 P の店舗管理者。参加内容に L6 はない / 一時非公開の掲載 L6 を新しく添えて保存する", async () => {
    const { k, m, l1, l6, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byPlace(m, pair, { listingIds: [l1, l6] }),
      BusinessRuleError,
      "OCCASION_LISTING_NOT_ATTACHABLE",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });

  it("changeParticipationByPlace#9 操作する人は店舗 P の店舗管理者 / 下書きの掲載 L4 を添えて保存する", async () => {
    const { k, m, l4, pair } = await setup();
    await expectCode(
      k.byPlace(m, pair, { listingIds: [l4] }),
      BusinessRuleError,
      "OCCASION_LISTING_NOT_ATTACHABLE",
    );
  });

  it("changeParticipationByPlace#10 操作する人は店舗 P の店舗管理者 / 別の店舗の掲載 M1 を添えて保存する", async () => {
    const { k, m, m1, pair } = await setup();
    await expectCode(
      k.byPlace(m, pair, { listingIds: [m1] }),
      BusinessRuleError,
      "OCCASION_LISTING_NOT_ATTACHABLE",
    );
  });

  it("changeParticipationByPlace#11 操作する人は店舗 P の店舗管理者 / 参加日を 10/4 にして保存する", async () => {
    const { k, m, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byPlace(m, pair, { dates: [oct(4)] }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });

  it("changeParticipationByPlace#12 操作する人は店舗 P の店舗管理者。参加日は 10/3。その後にイベントの開催期間が 10/1〜10/2 に更新された / 参加日を 10/2 にして保存する", async () => {
    const { k, o, m, pair } = await setup({ dates: [oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const view = await k.byPlace(m, pair, { dates: [oct(2)] });
    expect(view.visibleDates).toEqual([oct(2)]);
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(2),
    ]);
  });

  it("changeParticipationByPlace#13 操作する人は店舗 P の店舗管理者。参加日は 10/3。その後にイベントの開催期間が 10/1〜10/2 に更新された / 参加日 10/3 を残したまま、添える掲載だけを変更して保存する", async () => {
    const { k, o, m, l2, pair } = await setup({ dates: [oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byPlace(m, pair, { listingIds: [l2], dates: [oct(3)] }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });

  it("changeParticipationByPlace#14 操作する人は店舗 P の店舗管理者 / 現在と同じ参加内容で保存する", async () => {
    const { k, m, l1, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    await k.byPlace(m, pair, { listingIds: [l1], dates: [oct(1)] });
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
    expect(await k.events(CHANGED)).toEqual([]);
  });

  it("changeParticipationByPlace#15 操作する人は店舗 P の店舗管理者。保存するまでの間に、イベントの運営者が店舗 P を除外した / 参加内容を変更して保存する", async () => {
    const { k, organizer, m, pair } = await setup();
    const racing = commitAfter(k.container, () => k.exclude(organizer, pair));
    await expectCode(
      k.byPlace(m, pair, { dates: [oct(2)] }, { over: racing }),
      NotFoundError,
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("changeParticipationByPlace#16 操作する人は店舗 P の店舗管理者。編集を始めた後に、別の店舗管理者が参加内容を保存して版が進んでいる / 編集を始めたときの版を添えて保存する", async () => {
    const { k, p, m, l2, pair } = await setup();
    const started = (await k.storedParticipation(pair)).entity.version;
    const other = await k.manager(p, "other-steward");
    await k.byPlace(other, pair, { listingIds: [l2], dates: [oct(3)] });
    await expectCode(
      k.byPlace(m, pair, { dates: [oct(2)] }, { version: started }),
      ConflictError,
    );
    expect((await k.storedParticipation(pair)).entity.details).toEqual({
      listingIds: [l2],
      dates: [oct(3)],
    });
  });

  it("changeParticipationByPlace#17 操作する人は、イベント O の運営者で、店舗 P の管理権限を持たない / 参加内容を変更して保存する", async () => {
    const { k, organizer, pair } = await setup();
    await expectCode(
      k.byPlace(organizer, pair, { dates: [oct(2)] }),
      ForbiddenError,
    );
  });

  it("changeParticipationByPlace#18 店舗 P に店舗管理者がいない。操作する人はサービス運営者 / 参加内容を変更して保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const p = await k.place();
    const op = await k.operator();
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p, { dates: [oct(1)] });
    await expectCode(k.byPlace(op, pair, { dates: [oct(2)] }), ForbiddenError);
  });
  it("店舗管理者が保存の確定までの間に管理権限を失った / 参加内容を変更して保存する（D-17 の act_as_place）", async () => {
    const { k, p, m, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    const racing = commitAfter(k.container, () => k.removeSteward(k.ref(p), m));
    await expectCode(
      k.byPlace(m, pair, { dates: [oct(2)] }, { over: racing }),
      ForbiddenError,
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });

  it("judges an invalid input value before a stale version", async () => {
    const { k, p, m, l2, pair } = await setup();
    const started = (await k.storedParticipation(pair)).entity.version;
    const other = await k.manager(p, "other-steward");
    await k.byPlace(other, pair, { listingIds: [l2], dates: [oct(3)] });
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byPlace(m, pair, { dates: [oct(4)] }, { version: started }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });
});
