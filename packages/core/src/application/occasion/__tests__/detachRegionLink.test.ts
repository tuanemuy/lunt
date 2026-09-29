import { BusinessRuleError } from "@repo/core/domain/error";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit } from "./participationKit";

const DETACHED = "occasion.region_link_detached";

/** O's organizer and R's steward; O links R. */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const r = await k.region();
  const rs = await k.regionSteward(r, "region-steward");
  const pair = { occasionId: o, regionId: r };
  await k.link(organizer, pair);
  return { k, o, organizer, r, rs, pair };
}

describe("detachRegionLink", () => {
  it("detachRegionLink#1 操作する人は地域 R の運営者。イベント O が地域 R を関連づけ中（linked）。店舗 P は地域 R に所属中で、イベント O に参加中 / イベント O からの関連づけを解除する", async () => {
    const { k, o, r, rs, pair } = await setup();
    const p = await k.place();
    const m = await k.manager(p);
    const l1 = (await k.published(m, p)).id;
    await k.affiliate(p, r);
    await k.approved(o, p, { listingIds: [l1], dates: [oct(1)] });
    const linkedAt = (await k.findLink(pair))?.linkedAt;
    const participationBefore = await k.storedParticipation({
      occasionId: o,
      placeId: p,
    });
    const affiliationsBefore = await k.affiliations(p);
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const listingBefore = (await k.stored(l1)).entity;

    const view = await k.detach(rs, pair);

    expect(view.status).toBe("detached");
    expect(await k.findLink(pair)).toMatchObject({
      status: "detached",
      linkedAt,
    });
    expect((await k.events(DETACHED)).map((e) => e.payload)).toEqual([
      { occasionId: o, regionId: r },
    ]);
    expect(await k.storedParticipation({ occasionId: o, placeId: p })).toEqual(
      participationBefore,
    );
    expect(await k.affiliations(p)).toEqual(affiliationsBefore);
    expect(
      (await k.run(({ placeRepository }) => placeRepository.findById(p)))
        ?.entity,
    ).toEqual(placeBefore?.entity);
    expect((await k.stored(l1)).entity).toEqual(listingBefore);
  });

  it("detachRegionLink#2 操作する人は地域 R の運営者。解除した後 / イベント O の運営者が linkRegion で地域 R を関連づける", async () => {
    const { k, organizer, rs, pair } = await setup();
    await k.detach(rs, pair);
    await expectCode(
      k.link(organizer, pair),
      BusinessRuleError,
      "OCCASION_REGION_LINK_DETACHED",
    );
  });

  it("detachRegionLink#3 操作する人は地域 R の運営者。関連づけ中のイベント O は、運営による非公開 / 関連づけを解除する", async () => {
    const { k, o, rs, pair } = await setup();
    await k.changeOccasion(
      o,
      (occasion, now) => Occasion.suspend(occasion, now).entity,
    );
    await k.detach(rs, pair);
    expect((await k.findLink(pair))?.status).toBe("detached");
  });

  it("detachRegionLink#4 地域 R に地域運営者がいない。操作する人はサービス運営者 / 関連づけを解除する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const r = await k.region();
    const op = await k.operator();
    const pair = { occasionId: o, regionId: r };
    await k.linked(o, r);
    await k.detach(op, pair);
    expect((await k.findLink(pair))?.status).toBe("detached");
  });

  it("detachRegionLink#5 操作する人は地域 R の運営者。解除するまでの間に、イベント O の運営者が関連づけを外した / 関連づけを解除する", async () => {
    const { k, organizer, rs, pair } = await setup();
    const racing = commitAfter(k.container, () => k.unlink(organizer, pair));
    await expectCode(k.detach(rs, pair, racing), NotFoundError);
    expect(await k.findLink(pair)).toBeNull();
    expect(await k.events(DETACHED)).toEqual([]);
  });

  it("detachRegionLink#6 操作する人は地域 R の運営者。別の運営者がすでに解除している / 関連づけを解除する", async () => {
    const { k, r, rs, pair } = await setup();
    const other = await k.regionSteward(r, "other-region-steward");
    await k.detach(other, pair);
    const before = await k.findLink(pair);
    await expectCode(
      k.detach(rs, pair),
      BusinessRuleError,
      "OCCASION_REGION_LINK_ALREADY_DETACHED",
    );
    expect(await k.findLink(pair)).toEqual(before);
    expect(await k.events(DETACHED)).toHaveLength(1);
  });

  it("detachRegionLink#7 地域 R に地域運営者がいる。操作する人は、地域 R の管理権限を持たないサービス運営者 / 関連づけを解除する", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(k.detach(op, pair), ForbiddenError);
    expect((await k.findLink(pair))?.status).toBe("linked");
  });

  it("detachRegionLink#8 操作する人は、イベント O の運営者で、地域 R の管理権限を持たない / 関連づけを解除する", async () => {
    const { k, organizer, pair } = await setup();
    await expectCode(k.detach(organizer, pair), ForbiddenError);
  });

  it("detachRegionLink#9 操作する人は地域 R の運営者。関連づけは linked。別の運営者の解除が同時に確定する / 関連づけを解除する", async () => {
    const { k, r, rs, pair } = await setup();
    const other = await k.regionSteward(r, "other-region-steward");
    const racing = commitAfter(k.container, () => k.detach(other, pair));
    await expectCode(k.detach(rs, pair, racing), ConflictError);
    expect((await k.findLink(pair))?.status).toBe("detached");
    expect(await k.events(DETACHED)).toHaveLength(1);
  });
});
