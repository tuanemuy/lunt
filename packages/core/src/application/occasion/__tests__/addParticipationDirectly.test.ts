import { PlaceId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { listOccasionParticipants } from "../listOccasionParticipants";
import { oct, participationKit } from "./participationKit";

const ESTABLISHED = "occasion.participation_established";

/**
 * 共通の前提: O is 10/1〜10/3; P has no steward and is not suspended; L1
 * published and available, L2 一時非公開, L3 published and ended; P is
 * affiliated with R.
 */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const op = await k.operator();
  const p = await k.place();
  const l1 = (await k.published(op, p)).id;
  const l2 = (await k.unpublished(op, p)).id;
  const l3 = (await k.ended(op, p)).id;
  const r = await k.region();
  await k.affiliate(p, r);
  const pair = { occasionId: o, placeId: p };
  return { k, o, organizer, op, p, l1, l2, l3, r, pair };
}

describe("addParticipationDirectly", () => {
  it("addParticipationDirectly#1 操作する人はイベント O の運営者。店舗 P は参加していない / 掲載 L1 と参加日 10/1・10/2 を添えて、店舗 P を追加する", async () => {
    const { k, o, organizer, p, l1, pair } = await setup();
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const listingBefore = (await k.stored(l1)).entity;
    const affiliationsBefore = await k.affiliations(p);
    const now = k.clock.now();

    const view = await k.add(organizer, pair, {
      listingIds: [l1],
      dates: [oct(1), oct(2)],
    });

    const stored = (await k.storedParticipation(pair)).entity;
    expect(stored.participatedAt).toEqual(now);
    expect(stored.details).toEqual({
      listingIds: [l1],
      dates: [oct(1), oct(2)],
    });
    expect(view.visibleDates).toEqual([oct(1), oct(2)]);
    expect((await k.events(ESTABLISHED)).map((e) => e.payload)).toEqual([
      { occasionId: o, placeId: p },
    ]);
    const participants = await listOccasionParticipants({
      container: k.container,
      actor: organizer.actor,
      input: { occasionId: o, pagination: { page: 1, limit: 10 } },
    });
    expect(participants.items.map((i) => i.place.id)).toEqual([p]);
    const ofPlace = await k.run(({ participationRepository }) =>
      participationRepository.findByPlace(p, { page: 1, limit: 10 }),
    );
    expect(ofPlace.items.map((i) => i.key.occasionId)).toEqual([o]);
    const placeAfter = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    expect(placeAfter?.entity).toEqual(placeBefore?.entity);
    expect((await k.stored(l1)).entity).toEqual(listingBefore);
    expect(await k.affiliations(p)).toEqual(affiliationsBefore);
  });

  it("addParticipationDirectly#2 操作する人はイベント O の運営者 / 掲載も参加日も添えずに、店舗 P を追加する", async () => {
    const { k, organizer, pair } = await setup();
    await k.add(organizer, pair);
    expect((await k.storedParticipation(pair)).entity.details).toEqual({
      listingIds: [],
      dates: [],
    });
  });

  it("addParticipationDirectly#3 操作する人はイベント O の運営者 / 提供終了の掲載 L3 を添えて、店舗 P を追加する", async () => {
    const { k, organizer, pair, l3 } = await setup();
    await k.add(organizer, pair, { listingIds: [l3] });
    expect(
      (await k.storedParticipation(pair)).entity.details.listingIds,
    ).toEqual([l3]);
  });

  it("addParticipationDirectly#4 操作する人はイベント O の運営者。イベント O は開催期間を過ぎて終了している / 店舗 P を追加する", async () => {
    const { k, organizer, pair } = await setup();
    k.clock.set("2026-10-10T03:00:00.000Z");
    await k.add(organizer, pair);
    expect(await k.findParticipation(pair)).not.toBeNull();
  });

  it("addParticipationDirectly#5 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 店舗 P を追加する", async () => {
    const { k, op, p } = await setup();
    const vacant = await k.occasion();
    const pair = { occasionId: vacant, placeId: p };
    await k.add(op, pair);
    expect(await k.findParticipation(pair)).not.toBeNull();
  });

  it("addParticipationDirectly#6 操作する人はイベント O の運営者。店舗 Q に店舗管理者がいる / 店舗 Q を追加する", async () => {
    const { k, o, organizer } = await setup();
    const q = await k.place();
    await k.manager(q);
    const pair = { occasionId: o, placeId: q };
    await expectCode(
      k.add(organizer, pair),
      BusinessRuleError,
      "OCCASION_PLACE_HAS_STEWARD",
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#7 操作する人はイベント O の運営者。店舗 P は非公開になっている / 店舗 P を追加する", async () => {
    const { k, organizer, p, pair } = await setup();
    await k.suspendPlace(p);
    await expectCode(
      k.add(organizer, pair),
      BusinessRuleError,
      "OCCASION_PLACE_NOT_VIEWABLE",
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#8 操作する人はイベント O の運営者。店舗 P はすでに参加中 / 店舗 P を追加する", async () => {
    const { k, organizer, pair, l1 } = await setup();
    await k.add(organizer, pair, { listingIds: [l1] });
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.add(organizer, pair, { dates: [oct(2)] }),
      BusinessRuleError,
      "OCCASION_ALREADY_PARTICIPATING",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
    expect(await k.events(ESTABLISHED)).toHaveLength(1);
  });

  it("addParticipationDirectly#9 操作する人はイベント O の運営者。店舗 P の追加が成立した後 / 同じ追加をもう一度送る", async () => {
    const { k, organizer, pair, l1 } = await setup();
    const details = { listingIds: [l1], dates: [oct(1)] };
    await k.add(organizer, pair, details);
    await expectCode(
      k.add(organizer, pair, details),
      BusinessRuleError,
      "OCCASION_ALREADY_PARTICIPATING",
    );
  });

  it("addParticipationDirectly#10 操作する人はイベント O の運営者 / 一時非公開の掲載 L2 を添えて、店舗 P を追加する", async () => {
    const { k, organizer, pair, l2 } = await setup();
    await expectCode(
      k.add(organizer, pair, { listingIds: [l2] }),
      BusinessRuleError,
      "OCCASION_LISTING_NOT_ATTACHABLE",
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#11 操作する人はイベント O の運営者 / 参加日 10/4 を添えて、店舗 P を追加する", async () => {
    const { k, organizer, pair } = await setup();
    await expectCode(
      k.add(organizer, pair, { dates: [oct(4)] }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#12 操作する人はイベント O の運営者。除外された店舗 P は参加していない / 店舗 P を追加する", async () => {
    const { k, organizer, pair } = await setup();
    await k.add(organizer, pair);
    const first = (await k.storedParticipation(pair)).entity;
    await k.exclude(organizer, pair);
    const now = k.tick();
    await k.add(organizer, pair);
    const again = (await k.storedParticipation(pair)).entity;
    expect(again.participatedAt).toEqual(now);
    expect(again.participatedAt).not.toEqual(first.participatedAt);
    expect(await k.events(ESTABLISHED)).toHaveLength(2);
  });

  it("addParticipationDirectly#13 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / 店舗 P を追加する", async () => {
    const { k, op, pair } = await setup();
    await expectCode(k.add(op, pair), ForbiddenError);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#14 操作する人は、イベント O の管理権限を持たない利用者 / 店舗 P を追加する", async () => {
    const { k, pair } = await setup();
    const someone = await k.person();
    await expectCode(k.add(someone, pair), ForbiddenError);
  });

  it("addParticipationDirectly#15 操作する人はイベント O の運営者。指定した ID の店舗がない / 店舗を追加する", async () => {
    const { k, o, organizer } = await setup();
    const pair = { occasionId: o, placeId: PlaceId.create(k.newId()) };
    await expectCode(k.add(organizer, pair), NotFoundError, "PLACE_NOT_FOUND");
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("addParticipationDirectly#16 操作する人はイベント O の運営者。店舗 P の参加の申請の承認と、店舗 P の追加が、それぞれ読んだ時点の事実では成立する状態で、同時に確定する / 店舗 P を追加する", async () => {
    const { k, o, organizer, p, pair } = await setup();
    const racing = commitAfter(k.container, () => k.approved(o, p));
    await expectCode(k.add(organizer, pair, {}, racing), ConflictError);
    expect(await k.findParticipation(pair)).not.toBeNull();
    expect(await k.events(ESTABLISHED)).toHaveLength(1);
  });
});
