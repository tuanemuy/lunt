import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { occasionKit } from "./kit";

describe("unsuspendOccasion", () => {
  it("unsuspendOccasion#1 操作する人はサービス運営者。イベントは公開中のときに運営による非公開にされた / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    await k.suspend(o, occasion.id);
    const view = await k.unsuspend(o, occasion.id);
    expect(view.suspended).toBe(false);
    expect(view.publication).toEqual(occasion.publication);
    expect(view.viewable).toBe(true);
    expect(
      (await k.events("occasion.unsuspended")).map((e) => e.payload),
    ).toEqual([{ occasionId: occasion.id }]);
  });

  it("unsuspendOccasion#2 操作する人はサービス運営者。イベントは公開の取り下げ中（byManager）のときに運営による非公開にされた / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    await k.unpublish(o, occasion.id);
    await k.suspend(o, occasion.id);
    const view = await k.unsuspend(o, occasion.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unsuspendOccasion#3 操作する人はサービス運営者。イベントは公開中のときに運営による非公開にされ、その間に Moderation の takeDownPhotosByClaim で最後の写真が外されて unpublished（photoTakedown）になった / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    const [photo] = occasion.photos;
    if (photo === undefined) throw new Error("photo");
    await k.takeDown(occasion.id, [photo.photoId]);
    const view = await k.unsuspend(o, occasion.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    await k.update(s, occasion.id, { photoIds: [await k.photo(s)] });
    const republished = await k.publish(s, occasion.id);
    expect(republished.publication.status).toBe("published");
  });

  it("unsuspendOccasion#4 操作する人はサービス運営者。別のサービス運営者がすでに解除している / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const other = await k.operator("other");
    const occasion = await k.published(o);
    await k.suspend(o, occasion.id);
    await k.unsuspend(other, occasion.id);
    await expect(k.unsuspend(o, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_NOT_SUSPENDED",
    });
    expect(await k.events("occasion.unsuspended")).toHaveLength(1);
  });

  it("unsuspendOccasion#5 操作する人は、そのイベントのイベント運営者で、サービス運営者の役割を持たない / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    await expectCode(k.unsuspend(s, occasion.id), ForbiddenError);
    expect((await k.stored(occasion.id)).entity.suspension).toEqual({
      suspended: true,
    });
  });

  it("unsuspendOccasion#6 操作する人はサービス運営者。指定した ID のイベントがない / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.unsuspend(o, k.unknownOccasion()), NotFoundError);
  });

  it("unsuspendOccasion#7 操作する人はサービス運営者。イベントは運営による非公開。解除と、イベント運営者のイベント情報の保存が同時に確定する / 運営による非公開を解除する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    const racing = commitAfter(k.container, () =>
      k.update(s, occasion.id, { description: "先に確定" }),
    );
    await expectCode(k.unsuspend(o, occasion.id, racing), ConflictError);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.suspension).toEqual({ suspended: true });
    expect(after.content.description).toBe("先に確定");
    expect(await k.events("occasion.unsuspended")).toEqual([]);
  });
});
