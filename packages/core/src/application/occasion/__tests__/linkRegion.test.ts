import { RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit } from "./participationKit";

const LINKED = "occasion.region_linked";

async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const r = await k.region();
  const pair = { occasionId: o, regionId: r };
  return { k, o, organizer, r, pair };
}

describe("linkRegion", () => {
  it("linkRegion#1 操作する人はイベント O の運営者。地域 R は公開中で、運営による非公開でない。地域 R に地域運営者がいる。店舗 P はイベント O に参加中で、地域 R には所属していない / 地域 R を関連づける", async () => {
    const { k, o, organizer, r, pair } = await setup();
    await k.regionSteward(r);
    const p = await k.place();
    const m = await k.manager(p);
    const l1 = (await k.published(m, p)).id;
    await k.approved(o, p, { listingIds: [l1], dates: [oct(1)] });
    const participationBefore = await k.storedParticipation({
      occasionId: o,
      placeId: p,
    });
    const affiliationsBefore = await k.affiliations(p);
    const placeBefore = await k.run(({ placeRepository }) =>
      placeRepository.findById(p),
    );
    const listingBefore = (await k.stored(l1)).entity;
    const now = k.clock.now();

    const view = await k.link(organizer, pair);

    expect(view).toEqual({
      occasionId: o,
      regionId: r,
      status: "linked",
      linkedAt: now,
    });
    expect(await k.findLink(pair)).toMatchObject({
      status: "linked",
      linkedAt: now,
    });
    expect((await k.events(LINKED)).map((e) => e.payload)).toEqual([
      { occasionId: o, regionId: r },
    ]);
    const [ofOccasion, ofRegion] = await k.run(({ regionLinkRepository }) =>
      Promise.all([
        regionLinkRepository.findByOccasion(o, { page: 1, limit: 10 }),
        regionLinkRepository.findByRegion(r, { page: 1, limit: 10 }),
      ]),
    );
    expect(ofOccasion.items.map((l) => l.key.regionId)).toEqual([r]);
    expect(ofRegion.items.map((l) => l.key.occasionId)).toEqual([o]);
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

  it("linkRegion#2 操作する人はイベント O の運営者。地域 R を関連づけている / 公開中の地域 S を関連づける", async () => {
    const { k, o, organizer, r, pair } = await setup();
    await k.link(organizer, pair);
    const s = await k.region();
    await k.link(organizer, { occasionId: o, regionId: s });
    const links = await k.run(({ regionLinkRepository }) =>
      regionLinkRepository.findByOccasion(o, { page: 1, limit: 10 }),
    );
    expect(links.items.map((l) => l.key.regionId)).toEqual([r, s]);
  });

  it("linkRegion#3 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 地域 R を関連づける", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const r = await k.region();
    const op = await k.operator();
    const pair = { occasionId: o, regionId: r };
    await k.link(op, pair);
    expect((await k.findLink(pair))?.status).toBe("linked");
  });

  it("linkRegion#4 操作する人はイベント O の運営者。地域 R との関連づけを unlinkRegion で外した後 / 地域 R をあらためて関連づける", async () => {
    const { k, organizer, pair } = await setup();
    await k.link(organizer, pair);
    await k.unlink(organizer, pair);
    const now = k.tick();
    await k.link(organizer, pair);
    expect(await k.findLink(pair)).toMatchObject({
      status: "linked",
      linkedAt: now,
    });
  });

  it("linkRegion#5 操作する人はイベント O の運営者。地域 R をすでに関連づけている / 地域 R を関連づける", async () => {
    const { k, organizer, pair } = await setup();
    await k.link(organizer, pair);
    await expectCode(
      k.link(organizer, pair),
      BusinessRuleError,
      "OCCASION_REGION_ALREADY_LINKED",
    );
    expect(await k.events(LINKED)).toHaveLength(1);
  });

  it("linkRegion#6 操作する人はイベント O の運営者。地域 R の運営者が関連づけを解除している（detached） / 地域 R を関連づける", async () => {
    const { k, organizer, r, pair } = await setup();
    const rs = await k.regionSteward(r);
    await k.link(organizer, pair);
    await k.detach(rs, pair);
    await expectCode(
      k.link(organizer, pair),
      BusinessRuleError,
      "OCCASION_REGION_LINK_DETACHED",
    );
    expect((await k.findLink(pair))?.status).toBe("detached");
  });

  it("linkRegion#7 操作する人はイベント O の運営者。地域 R は公開の取り下げ中 / 地域 R を関連づける", async () => {
    const { k, o, organizer } = await setup();
    const r = await k.region("unpublished");
    const pair = { occasionId: o, regionId: r };
    await expectCode(
      k.link(organizer, pair),
      BusinessRuleError,
      "OCCASION_REGION_NOT_VIEWABLE",
    );
    expect(await k.findLink(pair)).toBeNull();
  });

  it("linkRegion#8 操作する人はイベント O の運営者。地域 R は公開中で、運営による非公開 / 地域 R を関連づける", async () => {
    const { k, o, organizer } = await setup();
    const r = await k.region("published", { suspended: true });
    await expectCode(
      k.link(organizer, { occasionId: o, regionId: r }),
      BusinessRuleError,
      "OCCASION_REGION_NOT_VIEWABLE",
    );
  });

  it("linkRegion#9 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / 地域 R を関連づける", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(k.link(op, pair), ForbiddenError);
  });

  it("linkRegion#10 操作する人は、地域 R の運営者で、イベント O の管理権限を持たない / 地域 R を関連づける", async () => {
    const { k, r, pair } = await setup();
    const rs = await k.regionSteward(r);
    await expectCode(k.link(rs, pair), ForbiddenError);
    expect(await k.findLink(pair)).toBeNull();
  });

  it("linkRegion#11 操作する人はイベント O の運営者。指定した ID の地域がない / 地域を関連づける", async () => {
    const { k, o, organizer } = await setup();
    const pair = { occasionId: o, regionId: RegionId.create(k.newId()) };
    await expectCode(
      k.link(organizer, pair),
      NotFoundError,
      "REGION_NOT_FOUND",
    );
    expect(await k.findLink(pair)).toBeNull();
  });

  it("linkRegion#12 操作する人はイベント O の運営者。別の運営者が、同じ地域 R の関連づけを同時に確定する / 地域 R を関連づける", async () => {
    const { k, o, organizer, pair } = await setup();
    const other = await k.organizer(o, "other-organizer");
    const racing = commitAfter(k.container, () => k.link(other, pair));
    await expectCode(k.link(organizer, pair, racing), ConflictError);
    expect((await k.findLink(pair))?.status).toBe("linked");
    expect(await k.events(LINKED)).toHaveLength(1);
  });
});
