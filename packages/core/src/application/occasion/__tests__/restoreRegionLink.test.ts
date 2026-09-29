import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { participationKit } from "./participationKit";

const DETACHED = "occasion.region_link_detached";

/** O's organizer and R's steward; O linked R and R's steward detached it. */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const r = await k.region();
  const rs = await k.regionSteward(r, "region-steward");
  const pair = { occasionId: o, regionId: r };
  const linkedAt = k.tick();
  await k.link(organizer, pair);
  k.tick();
  await k.detach(rs, pair);
  k.tick();
  return { k, o, organizer, r, rs, pair, linkedAt };
}

describe("restoreRegionLink", () => {
  it("restoreRegionLink#1 操作する人は地域 R の運営者。イベント O からの関連づけを解除している（detached） / 解除を取り消す", async () => {
    const { k, o, r, rs, pair, linkedAt } = await setup();
    const marked = await k.mark();
    const restoredAt = k.clock.now();
    const view = await k.restore(rs, pair);
    expect(restoredAt).not.toEqual(linkedAt);
    expect(view).toMatchObject({ status: "linked", linkedAt });
    expect(await k.findLink(pair)).toMatchObject({
      status: "linked",
      linkedAt,
      updatedAt: restoredAt,
    });
    expect(await k.since(marked)).toEqual([]);
    const [ofOccasion, ofRegion] = await k.run(({ regionLinkRepository }) =>
      Promise.all([
        regionLinkRepository.findByOccasion(o, { page: 1, limit: 10 }),
        regionLinkRepository.findByRegion(r, { page: 1, limit: 10 }),
      ]),
    );
    expect(ofOccasion.items.map((l) => [l.key.regionId, l.status])).toEqual([
      [r, "linked"],
    ]);
    expect(ofRegion.items.map((l) => [l.key.occasionId, l.status])).toEqual([
      [o, "linked"],
    ]);
  });

  it("restoreRegionLink#2 操作する人は地域 R の運営者。解除を取り消した後 / detachRegionLink で再び解除する", async () => {
    const { k, rs, pair } = await setup();
    await k.restore(rs, pair);
    await k.detach(rs, pair);
    expect((await k.findLink(pair))?.status).toBe("detached");
    expect(await k.events(DETACHED)).toHaveLength(2);
  });

  it("restoreRegionLink#3 操作する人は地域 R の運営者。解除を取り消した後 / イベント O の運営者が unlinkRegion で地域 R を外す", async () => {
    const { k, organizer, rs, pair } = await setup();
    await k.restore(rs, pair);
    await k.unlink(organizer, pair);
    expect(await k.findLink(pair)).toBeNull();
  });

  it("restoreRegionLink#4 地域 R に地域運営者がいない。操作する人はサービス運営者 / 解除を取り消す", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const r = await k.region();
    const op = await k.operator();
    const pair = { occasionId: o, regionId: r };
    await k.linked(o, r);
    await k.detach(op, pair);
    await k.restore(op, pair);
    expect((await k.findLink(pair))?.status).toBe("linked");
  });

  it("restoreRegionLink#5 操作する人は地域 R の運営者。関連づけは linked / 解除を取り消す", async () => {
    const { k, rs, pair } = await setup();
    await k.restore(rs, pair);
    const before = await k.findLink(pair);
    await expectCode(
      k.restore(rs, pair),
      BusinessRuleError,
      "OCCASION_REGION_LINK_NOT_DETACHED",
    );
    expect(await k.findLink(pair)).toEqual(before);
  });

  it("restoreRegionLink#6 操作する人は地域 R の運営者。イベント O と地域 R の関連づけがない / 解除を取り消す", async () => {
    const { k, r, rs } = await setup();
    const other = await k.occasion();
    await expectCode(
      k.restore(rs, { occasionId: other, regionId: r }),
      NotFoundError,
      "REGION_LINK_NOT_FOUND",
    );
  });

  it("restoreRegionLink#7 操作する人は、イベント O の運営者で、地域 R の管理権限を持たない / 解除を取り消す", async () => {
    const { k, organizer, pair } = await setup();
    await expectCode(k.restore(organizer, pair), ForbiddenError);
    expect((await k.findLink(pair))?.status).toBe("detached");
  });

  it("restoreRegionLink#8 地域 R に地域運営者がいる。操作する人は、地域 R の管理権限を持たないサービス運営者 / 解除を取り消す", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(k.restore(op, pair), ForbiddenError);
  });

  it("restoreRegionLink#9 操作する人は地域 R の運営者。関連づけは detached。別の運営者の解除の取り消しが同時に確定する / 解除を取り消す", async () => {
    const { k, r, rs, pair } = await setup();
    const detached = await k.findLink(pair);
    const other = await k.regionSteward(r, "other-region-steward");
    const racing = commitAfter(k.container, () => k.restore(other, pair));
    await expectCode(k.restore(rs, pair, racing), ConflictError);
    const after = await k.findLink(pair);
    expect(after?.status).toBe("linked");
    expect(after?.version).toBe(
      detached === null ? undefined : Version.next(detached.version),
    );
  });
});
