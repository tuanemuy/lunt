import { BusinessRuleError } from "@repo/core/domain/error";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { participationKit } from "./participationKit";

/** O's organizer and R's steward; O links R. */
async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const r = await k.region();
  const rs = await k.regionSteward(r);
  const pair = { occasionId: o, regionId: r };
  await k.link(organizer, pair);
  return { k, o, organizer, r, rs, pair };
}

describe("unlinkRegion", () => {
  it("unlinkRegion#1 操作する人はイベント O の運営者。地域 R を関連づけ中（linked） / 地域 R を外す", async () => {
    const { k, o, organizer, r, pair } = await setup();
    const marked = await k.mark();
    await k.unlink(organizer, pair);
    expect(await k.findLink(pair)).toBeNull();
    const [ofOccasion, ofRegion] = await k.run(({ regionLinkRepository }) =>
      Promise.all([
        regionLinkRepository.findByOccasion(o, { page: 1, limit: 10 }),
        regionLinkRepository.findByRegion(r, { page: 1, limit: 10 }),
      ]),
    );
    expect(ofOccasion).toEqual({ items: [], count: 0 });
    expect(ofRegion).toEqual({ items: [], count: 0 });
    expect(await k.since(marked)).toEqual([]);
  });

  it("unlinkRegion#2 操作する人はイベント O の運営者。関連づけ中の地域 R は、公開の取り下げ中 / 地域 R を外す", async () => {
    const { k, organizer, r, pair } = await setup();
    await k.changeRegion(
      r,
      (region, now) => Region.unpublish(region, now).entity,
    );
    await k.unlink(organizer, pair);
    expect(await k.findLink(pair)).toBeNull();
  });

  it("unlinkRegion#3 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 地域 R を外す", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const r = await k.region();
    const op = await k.operator();
    const pair = { occasionId: o, regionId: r };
    await k.linked(o, r);
    await k.unlink(op, pair);
    expect(await k.findLink(pair)).toBeNull();
  });

  it("unlinkRegion#4 操作する人はイベント O の運営者。地域 R の運営者が関連づけを解除している（detached） / 地域 R を外す", async () => {
    const { k, organizer, rs, pair } = await setup();
    await k.detach(rs, pair);
    await expectCode(
      k.unlink(organizer, pair),
      BusinessRuleError,
      "OCCASION_REGION_LINK_DETACHED",
    );
    expect((await k.findLink(pair))?.status).toBe("detached");
  });

  it("unlinkRegion#5 操作する人はイベント O の運営者。別の運営者がすでに地域 R を外している / 地域 R を外す", async () => {
    const { k, o, organizer, pair } = await setup();
    const other = await k.organizer(o, "other-organizer");
    await k.unlink(other, pair);
    await expectCode(
      k.unlink(organizer, pair),
      NotFoundError,
      "REGION_LINK_NOT_FOUND",
    );
  });

  it("unlinkRegion#6 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / 地域 R を外す", async () => {
    const { k, pair } = await setup();
    const op = await k.operator();
    await expectCode(k.unlink(op, pair), ForbiddenError);
    expect((await k.findLink(pair))?.status).toBe("linked");
  });

  it("unlinkRegion#7 操作する人は、地域 R の運営者で、イベント O の管理権限を持たない / 地域 R を外す", async () => {
    const { k, rs, pair } = await setup();
    await expectCode(k.unlink(rs, pair), ForbiddenError);
  });

  it("unlinkRegion#8 操作する人はイベント O の運営者。地域 R を関連づけ中。地域 R の運営者の解除と同時に外し、解除が先に確定した / 地域 R を外す", async () => {
    const { k, organizer, rs, pair } = await setup();
    const racing = commitAfter(k.container, () => k.detach(rs, pair));
    await expectCode(k.unlink(organizer, pair, racing), ConflictError);
    expect((await k.findLink(pair))?.status).toBe("detached");
  });
});
