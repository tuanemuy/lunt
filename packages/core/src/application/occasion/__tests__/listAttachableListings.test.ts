import { type OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { listAttachableListings } from "../listAttachableListings";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

/**
 * 共通の前提: P's L1 published and available, L2 upcoming, L3 a draft,
 * L4 一時非公開, L5 ended, L6 published but suspended; Q's L8 published
 * and available. The listings were made by the operator standing in for
 * P, before any steward.
 */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const op = await k.operator();
  const p = await k.place();
  const l1 = (await k.published(op, p, { name: "L1" })).id;
  const l2 = (await k.upcoming(op, p)).id;
  const l3 = (await k.draft(op, p)).id;
  const l4 = (await k.unpublished(op, p)).id;
  const l5 = (await k.ended(op, p)).id;
  const l6 = (await k.published(op, p)).id;
  await k.suspend(op, l6);
  const q = await k.place();
  const l8 = (await k.published(op, q)).id;
  return { k, o, op, p, q, l1, l2, l3, l4, l5, l6, l8 };
}

const read = (
  k: ParticipationKit,
  who: Person,
  occasionId: OccasionId,
  placeId: PlaceId,
) =>
  listAttachableListings({
    container: k.container,
    actor: who.actor,
    input: { occasionId, placeId, pagination: { page: 1, limit: 20 } },
  });

const ids = (view: Awaited<ReturnType<typeof read>>) =>
  new Set(view.items.map((item) => item.id));

describe("listAttachableListings", () => {
  it("listAttachableListings#1 操作する人は店舗 P の店舗管理者。店舗 P はイベント O に参加中 / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, p, l1, l2, l5 } = await setup();
    const m = await k.manager(p);
    await k.approved(o, p);
    const view = await read(k, m, o, p);
    expect(view.count).toBe(3);
    expect(ids(view)).toEqual(new Set([l1, l2, l5]));
    const byId = new Map(view.items.map((item) => [item.id, item]));
    expect(byId.get(l1)).toMatchObject({
      name: "L1",
      offeringStatus: { phase: "available" },
    });
    expect(byId.get(l2)?.offeringStatus.phase).toBe("upcoming");
    expect(byId.get(l5)?.offeringStatus.phase).toBe("ended");
  });

  it("listAttachableListings#2 操作する人は店舗 P の店舗管理者。店舗 P はイベント O に参加していない（参加の申請の入力） / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, p, l1, l2, l5 } = await setup();
    const m = await k.manager(p);
    expect(ids(await read(k, m, o, p))).toEqual(new Set([l1, l2, l5]));
  });

  it("listAttachableListings#3 操作する人はイベント O のイベント運営者。店舗 P は店舗管理者がいなく、イベント O に参加していない（直接の追加の入力） / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, p, l1, l2, l5 } = await setup();
    const organizer = await k.organizer(o);
    expect(ids(await read(k, organizer, o, p))).toEqual(new Set([l1, l2, l5]));
  });

  it("listAttachableListings#4 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, op, p, l1, l2, l5 } = await setup();
    expect(ids(await read(k, op, o, p))).toEqual(new Set([l1, l2, l5]));
  });

  it("listAttachableListings#5 操作する人は店舗 P の店舗管理者。店舗 P はイベント O に参加中 / 店舗 P の添えられる掲載を確かめ、返った L1 を添えて参加内容を変更する", async () => {
    const { k, o, p, l1 } = await setup();
    const m = await k.manager(p);
    await k.approved(o, p, { dates: [oct(1)] });
    const view = await read(k, m, o, p);
    const candidate = view.items.find((item) => item.id === l1);
    if (candidate === undefined) throw new Error("L1 is not a candidate");
    const pair = { occasionId: o, placeId: p };
    await k.byPlace(m, pair, { listingIds: [candidate.id], dates: [oct(1)] });
    expect(
      (await k.storedParticipation(pair)).entity.details.listingIds,
    ).toEqual([l1]);
  });

  it("listAttachableListings#6 操作する人は店舗 P の店舗管理者。L1 の updatedAt が L2 より新しい / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, p, l1, l2 } = await setup();
    const m = await k.manager(p);
    await k.saveName(m, l1, "新しい名前");
    const order = (await read(k, m, o, p)).items.map((item) => item.id);
    expect(order.indexOf(l1)).toBeLessThan(order.indexOf(l2));
    expect(order[0]).toBe(l1);
  });

  it("listAttachableListings#7 操作する人は店舗 P の店舗管理者。店舗 P に添えられる掲載がない / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, op } = await setup();
    const empty = await k.place();
    await k.draft(op, empty);
    const m = await k.manager(empty);
    expect(await read(k, m, o, empty)).toEqual({ items: [], count: 0 });
  });

  it("listAttachableListings#8 操作する人は、店舗 P の管理権限もイベント O の管理権限も持たない利用者 / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, p } = await setup();
    const someone = await k.person();
    await expectCode(read(k, someone, o, p), ForbiddenError);
  });

  it("listAttachableListings#9 イベント O にイベント運営者がいる。操作する人は、どちらの管理権限も持たないサービス運営者 / 店舗 P の添えられる掲載を確かめる", async () => {
    const { k, o, op, p } = await setup();
    await k.organizer(o);
    await expectCode(read(k, op, o, p), ForbiddenError);
  });

  it("listAttachableListings#10 操作する人はイベント O のイベント運営者。指定した ID の店舗がない / 添えられる掲載を確かめる", async () => {
    const { k, o } = await setup();
    const organizer = await k.organizer(o);
    await expectCode(
      read(k, organizer, o, PlaceId.create(k.newId())),
      NotFoundError,
      "PLACE_NOT_FOUND",
    );
  });
});
