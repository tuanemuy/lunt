import type { PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { getPlaceParticipations } from "../getPlaceParticipations";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

const day = (iso: string) => LocalDate.parse(iso);

const read = (k: ParticipationKit, who: Person, placeId: PlaceId) =>
  getPlaceParticipations({
    container: k.container,
    actor: who.actor,
    input: { placeId, pagination: { page: 1, limit: 20 } },
  });

async function setup() {
  const k = await participationKit();
  const p = await k.place();
  const m = await k.manager(p, "steward");
  return { k, p, m };
}

describe("getPlaceParticipations", () => {
  it("getPlaceParticipations#1 操作する人は店舗 P の店舗管理者。店舗 P は、イベント A（公開中、開催前）に先に、イベント B（公開中、開催中）に後から参加した。イベント A には掲載 L1 と参加日を添えている / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    const l1 = (await k.published(m, p, { name: "モーニング" })).id;
    const a = await k.occasion({ name: "A" });
    const b = await k.occasion({
      name: "B",
      period: [day("2026-07-09"), day("2026-07-12")],
    });
    await k.approved(a, p, { listingIds: [l1], dates: [oct(2)] });
    await k.approved(b, p);
    const view = await read(k, m, p);
    expect(view.count).toBe(2);
    expect(view.items.map((i) => i.occasion.id)).toEqual([b, a]);
    const [first, second] = view.items;
    expect(first?.occasion).toMatchObject({
      name: "B",
      period: { start: day("2026-07-09"), end: day("2026-07-12") },
      publication: { status: "published" },
      holdingStatus: "ongoing",
    });
    expect(second?.occasion).toMatchObject({
      name: "A",
      period: { start: oct(1), end: oct(3) },
      publication: { status: "published" },
      holdingStatus: "upcoming",
    });
    expect(second?.participation.listings).toEqual([
      expect.objectContaining({
        id: l1,
        name: "モーニング",
        offeringStatus: { phase: "available" },
      }),
    ]);
    expect(second?.participation.dates).toEqual([oct(2)]);
  });

  it("getPlaceParticipations#2 操作する人は店舗 P の店舗管理者。店舗 P は、公開の取り下げ中のイベント C、運営による非公開のイベント D、中止中のイベント E、開催期間を過ぎたイベント F に参加中 / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    const c = await k.occasion({ state: "unpublished" });
    const d = await k.occasion({ suspended: true });
    const e = await k.occasion({ cancelled: true });
    const f = await k.occasion({
      period: [day("2026-07-01"), day("2026-07-03")],
    });
    for (const id of [c, d, e, f]) await k.approved(id, p);
    const view = await read(k, m, p);
    expect(view.count).toBe(4);
    const byId = new Map(view.items.map((i) => [i.occasion.id, i.occasion]));
    expect(byId.get(c)?.publication.status).toBe("unpublished");
    expect(byId.get(d)?.suspended).toBe(true);
    expect(byId.get(e)?.holdingStatus).toBe("cancelled");
    expect(byId.get(f)?.holdingStatus).toBe("ended");
  });

  it("getPlaceParticipations#3 操作する人は店舗 P の店舗管理者。店舗 P の参加日は 10/2・10/3。その後にイベントの開催期間が 10/1〜10/2 に更新された / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    const o = await k.occasion();
    await k.approved(o, p, { dates: [oct(2), oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const [item] = (await read(k, m, p)).items;
    expect(item?.participation.dates).toEqual([oct(2), oct(3)]);
    expect(item?.participation.outOfPeriodDates).toEqual([oct(3)]);
    expect(item?.participation.visibleDates).toEqual([oct(2)]);
  });

  it("getPlaceParticipations#4 店舗 P の参加は、店舗管理者のいなかった時期に addParticipationDirectly で成立した。その後に就任した店舗管理者が操作する / 店舗 P の参加状況を確かめる", async () => {
    const k = await participationKit();
    const p = await k.place();
    const o = await k.occasion();
    const organizer = await k.organizer(o);
    await k.add(organizer, { occasionId: o, placeId: p });
    const m = await k.manager(p);
    const view = await read(k, m, p);
    expect(view.items.map((i) => i.occasion.id)).toEqual([o]);
  });

  it("getPlaceParticipations#5 操作する人は店舗 P の店舗管理者。添えた掲載 L1 は、添えた後に提供終了になった / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    const l1 = (await k.published(m, p)).id;
    const o = await k.occasion();
    await k.approved(o, p, { listingIds: [l1] });
    await k.end(m, l1);
    const [item] = (await read(k, m, p)).items;
    expect(item?.participation.listings).toEqual([
      expect.objectContaining({
        id: l1,
        deleted: false,
        offeringStatus: expect.objectContaining({ phase: "ended" }),
      }),
    ]);
  });

  it("getPlaceParticipations#6 操作する人は店舗 P の店舗管理者。店舗 P はどのイベントにも参加していない / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    expect(await read(k, m, p)).toEqual({ items: [], count: 0 });
  });

  it("getPlaceParticipations#7 操作する人は、店舗 P の管理権限を持たない利用者 / 店舗 P の参加状況を確かめる", async () => {
    const { k, p } = await setup();
    const someone = await k.person();
    await expectCode(read(k, someone, p), ForbiddenError);
  });

  it("getPlaceParticipations#8 店舗 P に店舗管理者がいない。操作する人はサービス運営者 / 店舗 P の参加状況を確かめる", async () => {
    const k = await participationKit();
    const p = await k.place();
    const op = await k.operator();
    await expectCode(read(k, op, p), ForbiddenError);
  });

  it("getPlaceParticipations#9 操作する人は店舗 P の店舗管理者。イベント A に添えた掲載 L2 は添えた後に一時非公開に、L7 は削除された / 店舗 P の参加状況を確かめる", async () => {
    const { k, p, m } = await setup();
    const l2 = (await k.published(m, p)).id;
    const l7 = (await k.published(m, p)).id;
    const a = await k.occasion();
    await k.approved(a, p, { listingIds: [l2, l7] });
    await k.unpublish(m, l2);
    await k.remove(m, l7);
    const [item] = (await read(k, m, p)).items;
    expect(item?.participation.listings).toEqual([
      expect.objectContaining({
        id: l2,
        deleted: false,
        publication: expect.objectContaining({ status: "unpublished" }),
        viewable: false,
      }),
      { id: l7, deleted: true },
    ]);
  });
});
