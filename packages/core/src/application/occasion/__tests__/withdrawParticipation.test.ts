import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit } from "./participationKit";

const DISSOLVED = "occasion.participation_dissolved";

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

describe("withdrawParticipation", () => {
  it("withdrawParticipation#1 操作する人は店舗 P の店舗管理者。店舗 P は、掲載 L1 を添えてイベント O に参加中。イベント O は公開中で開催前 / 参加を取りやめる", async () => {
    const { k, o, p, m, l1, pair } = await setup();
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const listingBefore = (await k.stored(l1)).entity;
    await k.withdraw(m, pair);
    expect(await k.findParticipation(pair)).toBeNull();
    const [ofOccasion, ofPlace] = await k.run(({ participationRepository }) =>
      Promise.all([
        participationRepository.findByOccasion(o, { page: 1, limit: 10 }),
        participationRepository.findByPlace(p, { page: 1, limit: 10 }),
      ]),
    );
    expect(ofOccasion).toEqual({ items: [], count: 0 });
    expect(ofPlace).toEqual({ items: [], count: 0 });
    expect((await k.events(DISSOLVED)).map((e) => e.payload)).toEqual([
      { occasionId: o, placeId: p, cause: "withdrawn" },
    ]);
    expect(
      (await k.run(({ placeRepository }) => placeRepository.findById(p)))
        ?.entity,
    ).toEqual(placeBefore?.entity);
    expect((await k.stored(l1)).entity).toEqual(listingBefore);
  });

  it("withdrawParticipation#2 操作する人は店舗 P の店舗管理者。イベント O は中止中で、運営による非公開 / 参加を取りやめる", async () => {
    const { k, o, m, pair } = await setup();
    await k.changeOccasion(
      o,
      (occasion, now) =>
        Occasion.suspend(Occasion.cancel(occasion, now).entity, now).entity,
    );
    await k.withdraw(m, pair);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("withdrawParticipation#3 店舗 P の参加は、店舗管理者のいなかった時期に addParticipationDirectly で成立した。その後に就任した店舗管理者が操作する / 参加を取りやめる", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const organizer = await k.organizer(o);
    const p = await k.place();
    const pair = { occasionId: o, placeId: p };
    await k.add(organizer, pair);
    const m = await k.manager(p);
    await k.withdraw(m, pair);
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("withdrawParticipation#4 操作する人は店舗 P の店舗管理者。取りやめるまでの間に、イベントの運営者が店舗 P を除外した / 参加を取りやめる", async () => {
    const { k, organizer, m, pair } = await setup();
    const racing = commitAfter(k.container, () => k.exclude(organizer, pair));
    await expectCode(k.withdraw(m, pair, racing), NotFoundError);
    expect((await k.events(DISSOLVED)).map((e) => e.payload)).toEqual([
      { ...pair, cause: "excluded" },
    ]);
  });

  it("withdrawParticipation#5 操作する人は店舗 P の店舗管理者。取りやめた後 / もう一度、参加を取りやめる", async () => {
    const { k, m, pair } = await setup();
    await k.withdraw(m, pair);
    await expectCode(
      k.withdraw(m, pair),
      NotFoundError,
      "PARTICIPATION_NOT_FOUND",
    );
    expect(await k.findParticipation(pair)).toBeNull();
    expect(await k.events(DISSOLVED)).toHaveLength(1);
  });

  it("withdrawParticipation#6 操作する人は、店舗 P の管理権限を持たない利用者（イベント O の運営者を含む） / 参加を取りやめる", async () => {
    const { k, organizer, pair } = await setup();
    const someone = await k.person();
    await expectCode(k.withdraw(organizer, pair), ForbiddenError);
    await expectCode(k.withdraw(someone, pair), ForbiddenError);
    expect(await k.findParticipation(pair)).not.toBeNull();
  });

  it("withdrawParticipation#7 店舗 P に店舗管理者がいない。操作する人はサービス運営者 / 参加を取りやめる", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const p = await k.place();
    const op = await k.operator();
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p);
    await expectCode(k.withdraw(op, pair), ForbiddenError);
    expect(await k.findParticipation(pair)).not.toBeNull();
  });
});
