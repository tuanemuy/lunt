import type { OccasionId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listOccasionRegionLinks } from "../listOccasionRegionLinks";
import { type ParticipationKit, participationKit } from "./participationKit";

const read = (k: ParticipationKit, who: Person, occasionId: OccasionId) =>
  listOccasionRegionLinks({
    container: k.container,
    actor: who.actor,
    input: { occasionId, pagination: { page: 1, limit: 20 } },
  });

async function setup() {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const r = await k.region("published", { name: "地域R" });
  const s = await k.region("published", { name: "地域S" });
  return { k, o, organizer, r, s };
}

describe("listOccasionRegionLinks", () => {
  it("listOccasionRegionLinks#1 操作する人はイベント O の運営者。地域 R を先に、地域 S を後から関連づけた。どちらも公開中 / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer, r, s } = await setup();
    await k.link(organizer, { occasionId: o, regionId: r });
    await k.link(organizer, { occasionId: o, regionId: s });
    const view = await read(k, organizer, o);
    expect(view.count).toBe(2);
    expect(
      view.items.map((i) => [
        i.region.id,
        i.status,
        i.region.name,
        i.region.publication.status,
      ]),
    ).toEqual([
      [r, "linked", "地域R", "published"],
      [s, "linked", "地域S", "published"],
    ]);
  });

  it("listOccasionRegionLinks#2 操作する人はイベント O の運営者。地域 R の運営者が関連づけを解除している / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer, r, s } = await setup();
    const rs = await k.regionSteward(r);
    await k.link(organizer, { occasionId: o, regionId: r });
    await k.link(organizer, { occasionId: o, regionId: s });
    await k.detach(rs, { occasionId: o, regionId: r });
    const view = await read(k, organizer, o);
    expect(view.items.map((i) => [i.region.id, i.status])).toEqual([
      [r, "detached"],
      [s, "linked"],
    ]);
  });

  it("listOccasionRegionLinks#3 操作する人はイベント O の運営者。関連づけ中の地域 R は公開の取り下げ中、地域 S は運営による非公開 / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer, r, s } = await setup();
    await k.link(organizer, { occasionId: o, regionId: r });
    await k.link(organizer, { occasionId: o, regionId: s });
    await k.changeRegion(
      r,
      (region, now) => Region.unpublish(region, now).entity,
    );
    await k.changeRegion(
      s,
      (region, now) => Region.suspend(region, now).entity,
    );
    const [itemR, itemS] = (await read(k, organizer, o)).items;
    expect(itemR?.region).toMatchObject({
      id: r,
      publication: { status: "unpublished" },
      suspended: false,
    });
    expect(itemS?.region).toMatchObject({
      id: s,
      publication: { status: "published" },
      suspended: true,
    });
  });

  it("listOccasionRegionLinks#4 操作する人はイベント O の運営者。地域 R を unlinkRegion で外した後 / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer, r, s } = await setup();
    await k.link(organizer, { occasionId: o, regionId: r });
    await k.link(organizer, { occasionId: o, regionId: s });
    await k.unlink(organizer, { occasionId: o, regionId: r });
    const view = await read(k, organizer, o);
    expect(view.items.map((i) => i.region.id)).toEqual([s]);
    expect(view.count).toBe(1);
  });

  it("listOccasionRegionLinks#5 操作する人はイベント O の運営者。関連づけがない / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer } = await setup();
    expect(await read(k, organizer, o)).toEqual({ items: [], count: 0 });
  });

  it("listOccasionRegionLinks#6 イベント O にイベント運営者がいない。操作する人はサービス運営者 / イベント O の開催地域を確かめる", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const r = await k.region();
    const op = await k.operator();
    await k.linked(o, r);
    const view = await read(k, op, o);
    expect(view.items.map((i) => i.region.id)).toEqual([r]);
  });

  it("listOccasionRegionLinks#7 操作する人は、イベント O の管理権限を持たない利用者（関連づけ中の地域 R の運営者を含む） / イベント O の開催地域を確かめる", async () => {
    const { k, o, organizer, r } = await setup();
    await k.link(organizer, { occasionId: o, regionId: r });
    const rs = await k.regionSteward(r);
    const someone = await k.person();
    await expectCode(read(k, rs, o), ForbiddenError);
    await expectCode(read(k, someone, o), ForbiddenError);
  });
});
