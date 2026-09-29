import { DateRange } from "@repo/core/domain/common/dateRange";
import { type OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { getParticipationDetails } from "../getParticipationDetails";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

/** 共通の前提: O is 10/1〜10/3; P's L1 is published and available. */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion({ name: "秋祭り" });
  const organizer = await k.organizer(o);
  const p = await k.place();
  const m = await k.manager(p, "steward");
  const l1 = (await k.published(m, p)).id;
  const pair = { occasionId: o, placeId: p };
  return { k, o, organizer, p, m, l1, pair };
}

const read = (
  k: ParticipationKit,
  who: Person,
  pair: Readonly<{ occasionId: OccasionId; placeId: PlaceId }>,
) =>
  getParticipationDetails({
    container: k.container,
    actor: who.actor,
    input: pair,
  });

describe("getParticipationDetails", () => {
  it("getParticipationDetails#1 操作する人は店舗 P の店舗管理者。店舗 P は、掲載 L1 と参加日 10/1 を添えてイベント O に参加中 / 店舗 P とイベント O の参加内容を確かめる", async () => {
    const { k, o, m, l1, pair } = await setup();
    await k.approved(o, pair.placeId, { listingIds: [l1], dates: [oct(1)] });
    const view = await read(k, m, pair);
    expect(view.occasion).toMatchObject({
      id: o,
      name: "秋祭り",
      period: DateRange.create(oct(1), oct(3)),
      publication: { status: "published" },
      suspended: false,
      holdingStatus: "upcoming",
    });
    expect(view.participation?.listings).toEqual([
      expect.objectContaining({
        id: l1,
        deleted: false,
        offeringStatus: { phase: "available" },
        viewable: true,
      }),
    ]);
    expect(view.participation?.dates).toEqual([oct(1)]);
    expect(view.placeHasSteward).toBe(true);
    expect(view.side).toBe("place");
  });

  it("getParticipationDetails#2 操作する人は店舗 P の店舗管理者。添えた掲載 L5 は添えた後に提供終了に、添えた掲載 L4 は添えた後に一時非公開になった / 参加内容を確かめる", async () => {
    const { k, o, m, p, pair } = await setup();
    const l5 = (await k.published(m, p)).id;
    const l4 = (await k.published(m, p)).id;
    await k.approved(o, p, { listingIds: [l5, l4] });
    await k.end(m, l5);
    await k.unpublish(m, l4);
    const view = await read(k, m, pair);
    expect(view.participation?.listings).toEqual([
      expect.objectContaining({
        id: l5,
        deleted: false,
        offeringStatus: expect.objectContaining({ phase: "ended" }),
      }),
      expect.objectContaining({
        id: l4,
        deleted: false,
        publication: expect.objectContaining({ status: "unpublished" }),
        viewable: false,
      }),
    ]);
  });

  it("getParticipationDetails#3 操作する人は店舗 P の店舗管理者。添えた掲載 L7 は添えた後に削除された / 参加内容を確かめる", async () => {
    const { k, o, m, p, l1, pair } = await setup();
    const l7 = (await k.published(m, p)).id;
    await k.approved(o, p, { listingIds: [l1, l7] });
    await k.remove(m, l7);
    const view = await read(k, m, pair);
    expect(view.participation?.listings.map((l) => [l.id, l.deleted])).toEqual([
      [l1, false],
      [l7, true],
    ]);
  });

  it("getParticipationDetails#4 操作する人は店舗 P の店舗管理者。参加日は 10/3。その後にイベントの開催期間が 10/1〜10/2 に更新された / 参加内容を確かめる", async () => {
    const { k, o, m, p, pair } = await setup();
    await k.approved(o, p, { dates: [oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const view = await read(k, m, pair);
    expect(view.occasion.period).toEqual(DateRange.create(oct(1), oct(2)));
    expect(view.participation?.dates).toEqual([oct(3)]);
    expect(view.participation?.outOfPeriodDates).toEqual([oct(3)]);
    expect(view.participation?.visibleDates).toEqual([]);
  });

  it("getParticipationDetails#5 操作する人は店舗 P の店舗管理者。イベント O は運営による非公開 / 参加内容を確かめる", async () => {
    const { k, o, m, p, pair } = await setup();
    await k.approved(o, p, { dates: [oct(1)] });
    await k.changeOccasion(
      o,
      (occasion, now) => Occasion.suspend(occasion, now).entity,
    );
    const view = await read(k, m, pair);
    expect(view.occasion.suspended).toBe(true);
    expect(view.participation?.dates).toEqual([oct(1)]);
  });

  it("getParticipationDetails#6 操作する人はイベント O の運営者。店舗 P は店舗管理者がいなく、イベント O に参加していない / 参加内容を確かめる", async () => {
    const { k, o, organizer } = await setup();
    const q = await k.place();
    const view = await read(k, organizer, { occasionId: o, placeId: q });
    expect(view.participation).toBeNull();
    expect(view.occasion.period).toEqual(DateRange.create(oct(1), oct(3)));
    expect(view.placeHasSteward).toBe(false);
    expect(view.side).toBe("occasion");
  });

  it("getParticipationDetails#7 操作する人はイベント O の運営者。店舗 P は店舗管理者がいなく、イベント O に参加中 / 参加内容を確かめる", async () => {
    const { k, o, organizer } = await setup();
    const q = await k.place();
    const pair = { occasionId: o, placeId: q };
    await k.add(organizer, pair, { dates: [oct(2)] });
    const view = await read(k, organizer, pair);
    expect(view.participation?.dates).toEqual([oct(2)]);
    expect(view.placeHasSteward).toBe(false);
  });

  it("getParticipationDetails#8 操作する人はイベント O の運営者。通知の後に、店舗 P が参加を取りやめている / 参加内容を確かめる", async () => {
    const { k, o, organizer, m, p, pair } = await setup();
    await k.approved(o, p);
    await k.withdraw(m, pair);
    const view = await read(k, organizer, pair);
    expect(view.participation).toBeNull();
  });

  it("getParticipationDetails#9 操作する人は、店舗 P の管理権限もイベント O の管理権限も持たない利用者 / 参加内容を確かめる", async () => {
    const { k, pair } = await setup();
    const someone = await k.person();
    await expectCode(read(k, someone, pair), ForbiddenError);
  });

  it("getParticipationDetails#10 イベント O にイベント運営者がいる。操作する人は、どちらの管理権限も持たないサービス運営者 / 参加内容を確かめる", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(read(k, op, pair), ForbiddenError);
  });

  it("getParticipationDetails#11 操作する人はイベント O の運営者。指定した ID の店舗がない / 参加内容を確かめる", async () => {
    const { k, o, organizer } = await setup();
    await expectCode(
      read(k, organizer, {
        occasionId: o,
        placeId: PlaceId.create(k.newId()),
      }),
      NotFoundError,
      "PLACE_NOT_FOUND",
    );
  });
});
