import type { RegionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listRegionOccasionLinks } from "../listRegionOccasionLinks";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

const read = (k: ParticipationKit, who: Person, regionId: RegionId) =>
  listRegionOccasionLinks({
    container: k.container,
    actor: who.actor,
    input: { regionId, pagination: { page: 1, limit: 20 } },
  });

async function setup() {
  const k = await participationKit();
  const r = await k.region();
  const rs = await k.regionSteward(r, "region-steward");
  return { k, r, rs };
}

describe("listRegionOccasionLinks", () => {
  it("listRegionOccasionLinks#1 操作する人は地域 R の運営者。イベント A が先に、イベント B が後から地域 R を関連づけた。A は公開中で開催前、B は公開中で開催中 / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r, rs } = await setup();
    const a = await k.occasion({ name: "A" });
    const b = await k.occasion({
      name: "B",
      period: [LocalDate.parse("2026-07-09"), LocalDate.parse("2026-07-12")],
    });
    await k.linked(a, r);
    await k.linked(b, r);
    const view = await read(k, rs, r);
    expect(view.count).toBe(2);
    expect(view.items.map((i) => i.occasion.id)).toEqual([b, a]);
    const [itemB, itemA] = view.items;
    expect(itemB?.occasion).toMatchObject({
      name: "B",
      period: {
        start: LocalDate.parse("2026-07-09"),
        end: LocalDate.parse("2026-07-12"),
      },
      publication: { status: "published" },
      holdingStatus: "ongoing",
    });
    expect(itemA?.occasion).toMatchObject({
      name: "A",
      period: { start: oct(1), end: oct(3) },
      publication: { status: "published" },
      holdingStatus: "upcoming",
    });
  });

  it("listRegionOccasionLinks#2 操作する人は地域 R の運営者。イベント A との関連づけは linked、イベント B との関連づけは detached / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r, rs } = await setup();
    const a = await k.occasion();
    const b = await k.occasion();
    await k.linked(a, r);
    await k.linked(b, r);
    await k.detach(rs, { occasionId: b, regionId: r });
    const view = await read(k, rs, r);
    const byId = new Map(view.items.map((i) => [i.occasion.id, i.status]));
    expect(byId.get(a)).toBe("linked");
    expect(byId.get(b)).toBe("detached");
  });

  it("listRegionOccasionLinks#3 操作する人は地域 R の運営者。関連づけ中のイベント A は公開の取り下げ中、イベント B は運営による非公開、イベント C は中止中 / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r, rs } = await setup();
    const a = await k.occasion({ state: "unpublished" });
    const b = await k.occasion({ suspended: true });
    const c = await k.occasion({ cancelled: true });
    for (const id of [a, b, c]) await k.linked(id, r);
    const view = await read(k, rs, r);
    expect(view.count).toBe(3);
    const byId = new Map(view.items.map((i) => [i.occasion.id, i.occasion]));
    expect(byId.get(a)?.publication.status).toBe("unpublished");
    expect(byId.get(b)?.suspended).toBe(true);
    expect(byId.get(c)?.holdingStatus).toBe("cancelled");
  });

  it("listRegionOccasionLinks#4 操作する人は地域 R の運営者。イベント A の運営者が unlinkRegion で地域 R を外した後 / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r, rs } = await setup();
    const a = await k.occasion();
    const organizer = await k.organizer(a);
    await k.link(organizer, { occasionId: a, regionId: r });
    await k.unlink(organizer, { occasionId: a, regionId: r });
    expect(await read(k, rs, r)).toEqual({ items: [], count: 0 });
  });

  it("listRegionOccasionLinks#5 操作する人は地域 R の運営者。関連づけられたイベントがない / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r, rs } = await setup();
    expect(await read(k, rs, r)).toEqual({ items: [], count: 0 });
  });

  it("listRegionOccasionLinks#6 地域 R に地域運営者がいない。操作する人はサービス運営者 / 地域 R に関連づけられたイベントを確かめる", async () => {
    const k = await participationKit();
    const r = await k.region();
    const a = await k.occasion();
    const op = await k.operator();
    await k.linked(a, r);
    const view = await read(k, op, r);
    expect(view.items.map((i) => i.occasion.id)).toEqual([a]);
  });

  it("listRegionOccasionLinks#7 操作する人は、地域 R の管理権限を持たない利用者（関連づけ中のイベント A の運営者を含む） / 地域 R に関連づけられたイベントを確かめる", async () => {
    const { k, r } = await setup();
    const a = await k.occasion();
    const organizer = await k.organizer(a);
    await k.link(organizer, { occasionId: a, regionId: r });
    const someone = await k.person();
    await expectCode(read(k, organizer, r), ForbiddenError);
    await expectCode(read(k, someone, r), ForbiddenError);
  });
});
