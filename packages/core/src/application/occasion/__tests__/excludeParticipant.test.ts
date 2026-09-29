import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit } from "./participationKit";

const DISSOLVED = "occasion.participation_dissolved";

/** P has a steward and took part by an approval, with L1. */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const p = await k.place();
  const m = await k.manager(p, "steward");
  const l1 = (await k.published(m, p)).id;
  const pair = { occasionId: o, placeId: p };
  await k.approved(o, p, { listingIds: [l1], dates: [oct(1)] });
  return { k, o, organizer, p, m, l1, pair };
}

describe("excludeParticipant", () => {
  it("excludeParticipant#1 操作する人はイベント O の運営者。店舗管理者のいる店舗 P が、参加の申請の承認で、掲載 L1 を添えて参加中 / 店舗 P を除外する", async () => {
    const { k, o, organizer, p, l1, pair } = await setup();
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const listingBefore = (await k.stored(l1)).entity;
    await k.exclude(organizer, pair);
    expect(await k.findParticipation(pair)).toBeNull();
    expect((await k.events(DISSOLVED)).map((e) => e.payload)).toEqual([
      { occasionId: o, placeId: p, cause: "excluded" },
    ]);
    expect(
      (await k.run(({ placeRepository }) => placeRepository.findById(p)))
        ?.entity,
    ).toEqual(placeBefore?.entity);
    expect((await k.stored(l1)).entity).toEqual(listingBefore);
  });

  it("excludeParticipant#2 操作する人はイベント O の運営者。管理者のいない店舗 Q が、直接の追加で参加中 / 店舗 Q を除外する", async () => {
    const { k, o, organizer } = await setup();
    const q = await k.place();
    const pair = { occasionId: o, placeId: q };
    await k.add(organizer, pair);
    await k.exclude(organizer, pair);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("excludeParticipant#3 操作する人はイベント O の運営者。イベント O は開催期間を過ぎて終了している / 店舗 P を除外する", async () => {
    const { k, organizer, pair } = await setup();
    k.clock.set("2026-10-10T03:00:00.000Z");
    await k.exclude(organizer, pair);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("excludeParticipant#4 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 店舗 P を除外する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const op = await k.operator();
    const p = await k.place();
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p);
    await k.exclude(op, pair);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("excludeParticipant#5 操作する人はイベント O の運営者。除外するまでの間に、店舗 P の店舗管理者が参加を取りやめた / 店舗 P を除外する", async () => {
    const { k, organizer, m, pair } = await setup();
    const racing = commitAfter(k.container, () => k.withdraw(m, pair));
    await expectCode(k.exclude(organizer, pair, racing), NotFoundError);
    expect((await k.events(DISSOLVED)).map((e) => e.payload)).toEqual([
      { ...pair, cause: "withdrawn" },
    ]);
  });

  it("excludeParticipant#6 操作する人はイベント O の運営者。店舗 P を除外した後 / もう一度、店舗 P を除外する", async () => {
    const { k, organizer, pair } = await setup();
    await k.exclude(organizer, pair);
    await expectCode(
      k.exclude(organizer, pair),
      NotFoundError,
      "PARTICIPATION_NOT_FOUND",
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("excludeParticipant#7 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / 店舗 P を除外する", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(k.exclude(op, pair), ForbiddenError);
    expect(await k.findParticipation(pair)).not.toBeNull();
  });

  it("excludeParticipant#8 操作する人は、店舗 P の店舗管理者で、イベント O の管理権限を持たない / 店舗 P を除外する", async () => {
    const { k, m, pair } = await setup();
    await expectCode(k.exclude(m, pair), ForbiddenError);
  });
});
