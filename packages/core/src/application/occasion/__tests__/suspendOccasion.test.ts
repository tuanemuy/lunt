import { RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { occasionKit } from "./kit";

describe("suspendOccasion", () => {
  it("suspendOccasion#1 操作する人はサービス運営者。イベントは公開中で、イベント運営者がいる / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    await k.steward(occasion.id);
    const view = await k.suspend(o, occasion.id);
    const stored = (await k.stored(occasion.id)).entity;
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
    expect(view.viewable).toBe(false);
    expect(
      (await k.events("occasion.suspended")).map((e) => e.payload),
    ).toEqual([{ occasionId: occasion.id }]);
  });

  it("suspendOccasion#2 操作する人はサービス運営者。イベントは draft で、イベント運営者がいない / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.register(o);
    const view = await k.suspend(o, occasion.id);
    expect(view.suspended).toBe(true);
    expect(view.publication.status).toBe("draft");
  });

  it("suspendOccasion#3 操作する人はサービス運営者。イベントは公開の取り下げ中で、中止中。店舗 P が参加中で、地域 R が関連づけ中 / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    await k.unpublish(o, occasion.id);
    await k.cancel(o, occasion.id);
    const p = await k.place();
    const participation = await k.participate(occasion.id, p);
    const r = RegionId.create(k.newId());
    const link = await k.link(occasion.id, r);
    const view = await k.suspend(o, occasion.id);
    expect(view.suspended).toBe(true);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
    expect(view.cancelled).toBe(true);
    expect(await k.participation(occasion.id, p)).toEqual(participation);
    expect(await k.regionLink(occasion.id, r)).toEqual(link);
  });

  it("suspendOccasion#4 操作する人はサービス運営者。イベントを運営による非公開にした後 / イベント運営者が publishOccasion・unpublishOccasion を行う", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const published = await k.published(o);
    const draft = await k.register(o);
    const s = await k.steward(published.id);
    await k.appoint(k.ref(draft.id), s);
    await k.suspend(o, published.id);
    await k.suspend(o, draft.id);
    await expect(k.unpublish(s, published.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    await expect(k.publish(s, draft.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    const view = await k.update(s, published.id, { description: "更新できる" });
    expect(view.description).toBe("更新できる");
  });

  it("suspendOccasion#5 操作する人はサービス運営者。別のサービス運営者がすでに運営による非公開にしている / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const other = await k.operator("other");
    const occasion = await k.published(o);
    await k.suspend(other, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.suspend(o, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_ALREADY_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.events("occasion.suspended")).toHaveLength(1);
  });

  it("suspendOccasion#6 操作する人は、そのイベントのイベント運営者で、サービス運営者の役割を持たない / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(k.suspend(s, occasion.id), ForbiddenError);
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("suspendOccasion#7 操作する人はサービス運営者。指定した ID のイベントがない / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.suspend(o, k.unknownOccasion()), NotFoundError);
  });

  it("suspendOccasion#8 操作する人はサービス運営者。運営による非公開と、イベント運営者のイベント情報の保存が同時に確定する / 運営による非公開にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    const racing = commitAfter(k.container, () =>
      k.update(s, occasion.id, { description: "先に確定" }),
    );
    await expectCode(k.suspend(o, occasion.id, racing), ConflictError);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.suspension).toEqual({ suspended: false });
    expect(after.content.description).toBe("先に確定");
    expect(await k.events("occasion.suspended")).toEqual([]);
  });
});
