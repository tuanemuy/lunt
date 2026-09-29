import type { OccasionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listOccasionParticipants } from "../listOccasionParticipants";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

const read = (k: ParticipationKit, who: Person, occasionId: OccasionId) =>
  listOccasionParticipants({
    container: k.container,
    actor: who.actor,
    input: { occasionId, pagination: { page: 1, limit: 20 } },
  });

async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const p = await k.place("店舗P");
  const m = await k.manager(p, "steward");
  return { k, o, organizer, p, m };
}

describe("listOccasionParticipants", () => {
  it("listOccasionParticipants#1 操作する人はイベント O の運営者。店舗管理者のいる店舗 P が先に（掲載 L1 と参加日を添えて）、管理者のいない店舗 Q が後から参加した / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p, m } = await setup();
    const l1 = (await k.published(m, p, { name: "L1" })).id;
    await k.approved(o, p, { listingIds: [l1], dates: [oct(1)] });
    const q = await k.place("店舗Q");
    k.tick();
    await k.add(organizer, { occasionId: o, placeId: q });
    const view = await read(k, organizer, o);
    expect(view.count).toBe(2);
    expect(view.items.map((i) => i.place.id)).toEqual([q, p]);
    const [itemQ, itemP] = view.items;
    expect(itemQ?.placeHasSteward).toBe(false);
    expect(itemP?.placeHasSteward).toBe(true);
    expect(itemP?.place.name).toBe("店舗P");
    expect(itemP?.participation.listings).toEqual([
      expect.objectContaining({
        id: l1,
        name: "L1",
        offeringStatus: { phase: "available" },
      }),
    ]);
    expect(itemP?.participation.dates).toEqual([oct(1)]);
  });

  it("listOccasionParticipants#2 操作する人はイベント O の運営者。参加店舗 P は閉店していて、参加店舗 Q は非公開 / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p } = await setup();
    const q = await k.place();
    await k.approved(o, p);
    await k.approved(o, q);
    await k.setOperatingStatus(p, "permanentlyClosed");
    await k.suspendPlace(q);
    const view = await read(k, organizer, o);
    const byId = new Map(view.items.map((i) => [i.place.id, i.place]));
    expect(byId.get(p)).toMatchObject({
      operatingStatus: "permanentlyClosed",
      suspended: false,
    });
    expect(byId.get(q)).toMatchObject({
      operatingStatus: "open",
      suspended: true,
    });
  });

  it("listOccasionParticipants#3 操作する人はイベント O の運営者。店舗 P の参加日は 10/3。その後に開催期間が 10/1〜10/2 に更新された / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p } = await setup();
    await k.approved(o, p, { dates: [oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const [item] = (await read(k, organizer, o)).items;
    expect(item?.participation.dates).toEqual([oct(3)]);
    expect(item?.participation.outOfPeriodDates).toEqual([oct(3)]);
  });

  it("listOccasionParticipants#4 操作する人はイベント O の運営者。店舗 P の添えた掲載 L1 は、添えた後に提供終了になった / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p, m } = await setup();
    const l1 = (await k.published(m, p)).id;
    await k.approved(o, p, { listingIds: [l1] });
    await k.end(m, l1);
    const [item] = (await read(k, organizer, o)).items;
    expect(item?.participation.listings).toEqual([
      expect.objectContaining({
        id: l1,
        offeringStatus: expect.objectContaining({ phase: "ended" }),
      }),
    ]);
  });

  it("listOccasionParticipants#5 操作する人はイベント O の運営者。店舗 P が参加を取りやめた後 / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p, m } = await setup();
    await k.approved(o, p);
    await k.withdraw(m, { occasionId: o, placeId: p });
    expect(await read(k, organizer, o)).toEqual({ items: [], count: 0 });
  });

  it("listOccasionParticipants#6 操作する人はイベント O の運営者。参加店舗がない / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer } = await setup();
    expect(await read(k, organizer, o)).toEqual({ items: [], count: 0 });
  });

  it("listOccasionParticipants#7 イベント O にイベント運営者がいない。操作する人はサービス運営者 / イベント O の参加店舗を確かめる", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const op = await k.operator();
    const p = await k.place();
    await k.approved(o, p);
    const view = await read(k, op, o);
    expect(view.items.map((i) => i.place.id)).toEqual([p]);
  });

  it("listOccasionParticipants#8 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / イベント O の参加店舗を確かめる", async () => {
    const { k, o } = await setup();
    const op = await k.operator();
    await expectCode(read(k, op, o), ForbiddenError);
  });

  it("listOccasionParticipants#9 操作する人は、参加店舗 P の店舗管理者で、イベント O の管理権限を持たない / イベント O の参加店舗を確かめる", async () => {
    const { k, o, p, m } = await setup();
    await k.approved(o, p);
    await expectCode(read(k, m, o), ForbiddenError);
  });

  it("listOccasionParticipants#10 操作する人はイベント O の運営者。店舗 P の添えた掲載 L2 は添えた後に運営による非公開に、L7 は削除された / イベント O の参加店舗を確かめる", async () => {
    const { k, o, organizer, p, m } = await setup();
    const op = await k.operator();
    const l2 = (await k.published(m, p)).id;
    const l7 = (await k.published(m, p)).id;
    await k.approved(o, p, { listingIds: [l2, l7] });
    await k.suspend(op, l2);
    await k.remove(m, l7);
    const [item] = (await read(k, organizer, o)).items;
    expect(item?.participation.listings).toEqual([
      expect.objectContaining({
        id: l2,
        deleted: false,
        suspended: true,
        viewable: false,
      }),
      { id: l7, deleted: true },
    ]);
  });
});
