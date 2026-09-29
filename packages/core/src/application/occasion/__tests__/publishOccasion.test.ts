import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  rejection,
} from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { occasionKit } from "./kit";

type K = Awaited<ReturnType<typeof occasionKit>>;

/** A draft registered by an operator, and its occasion operator. */
async function draftWithSteward(k: K, spec: Parameters<K["register"]>[1] = {}) {
  const o = await k.operator();
  const occasion = await k.register(o, spec);
  const s = await k.steward(occasion.id);
  return { o, s, occasion };
}

describe("publishOccasion", () => {
  it("publishOccasion#1 操作する人はイベント運営者。イベントは draft で、名称・開催期間・開催場所（所在地と位置）・写真1枚を持つ / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    k.tick();
    const view = await k.publish(s, occasion.id);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.publication).toEqual({
      status: "published",
      firstPublishedAt: k.clock.now(),
    });
    expect(after.version).toBe(before.version + 1);
    expect(view.publication.status).toBe("published");
    expect(await k.events()).toEqual([]);
  });

  it("publishOccasion#2 イベントにイベント運営者がいない。操作する人はサービス運営者。イベントは draft で公開条件を満たす / 公開する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.register(o);
    const view = await k.publish(o, occasion.id);
    expect(view.publication.status).toBe("published");
    expect(view.access.basis).toBe("absence_proxy");
  });

  it("publishOccasion#3 操作する人はイベント運営者。イベントは公開の取り下げ中（byManager）で、公開条件を満たす / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    const first = await k.publish(s, occasion.id);
    await k.unpublish(s, occasion.id);
    k.tick();
    const view = await k.publish(s, occasion.id);
    expect(view.publication).toEqual(first.publication);
  });

  it("publishOccasion#4 操作する人はイベント運営者。イベントは、申立てによる最後の写真の削除で公開の取り下げ（photoTakedown）になった後、updateOccasionContent で写真を1枚載せて保存してある / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    await k.publish(s, occasion.id);
    const [photo] = occasion.photos;
    if (photo === undefined) throw new Error("photo");
    await k.takeDown(occasion.id, [photo.photoId]);
    expect((await k.stored(occasion.id)).entity.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    await k.update(s, occasion.id, { photoIds: [await k.photo(s)] });
    const view = await k.publish(s, occasion.id);
    expect(view.publication.status).toBe("published");
  });

  it("publishOccasion#5 操作する人はイベント運営者。イベントは、申立てによる最後の写真の削除で公開の取り下げ（photoTakedown）になっていて、写真がない / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    await k.publish(s, occasion.id);
    const [photo] = occasion.photos;
    if (photo === undefined) throw new Error("photo");
    await k.takeDown(occasion.id, [photo.photoId]);
    const error = await rejection(k.publish(s, occasion.id));
    expect(error).toMatchObject({
      code: "OCCASION_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
    expect((await k.stored(occasion.id)).entity.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
  });

  it("publishOccasion#6 操作する人はイベント運営者。イベントは draft で、開催場所の位置がない / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k, { location: null });
    const error = await rejection(k.publish(s, occasion.id));
    expect(error).toMatchObject({
      code: "OCCASION_PUBLISH_CONDITION_UNMET",
      missing: ["venue"],
    });
    expect((await k.stored(occasion.id)).entity.publication.status).toBe(
      "draft",
    );
  });

  it("publishOccasion#7 操作する人はイベント運営者。イベントは draft で、公開条件を満たし、開催期間を過ぎている / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    k.setToday("2026-10-10");
    const view = await k.publish(s, occasion.id);
    expect(view.publication.status).toBe("published");
    expect(view.holdingStatus).toBe("ended");
  });

  it("publishOccasion#8 操作する人はイベント運営者。イベントは公開の取り下げ中で公開条件を満たし、運営による非公開 / 公開する", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await draftWithSteward(k);
    await k.publish(s, occasion.id);
    await k.unpublish(s, occasion.id);
    await k.suspend(o, occasion.id);
    await expect(k.publish(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity.publication.status).toBe(
      "unpublished",
    );
  });

  it("publishOccasion#9 操作する人はイベント運営者。イベントは公開中 / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    await k.publish(s, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    k.tick();
    await expect(k.publish(s, occasion.id)).rejects.toMatchObject({
      code: "COMMON_PUBLICATION_INVALID_TRANSITION",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("publishOccasion#10 イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 / 公開する", async () => {
    const k = await occasionKit();
    const { o, occasion } = await draftWithSteward(k);
    await expectCode(k.publish(o, occasion.id), ForbiddenError);
  });

  it("publishOccasion#11 操作する人は、そのイベントの管理権限を持たない利用者 / 公開する", async () => {
    const k = await occasionKit();
    const { occasion } = await draftWithSteward(k);
    const stranger = await k.person("stranger");
    await expectCode(k.publish(stranger, occasion.id), ForbiddenError);
  });

  it("publishOccasion#12 指定した ID のイベントがない / 公開する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.publish(o, k.unknownOccasion()), NotFoundError);
  });

  it("publishOccasion#13 操作する人はイベント運営者。イベントは公開中で、運営による非公開 / 公開する", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await draftWithSteward(k);
    await k.publish(s, occasion.id);
    await k.suspend(o, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.publish(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("publishOccasion#14 操作する人はイベント運営者。イベントは draft で運営による非公開。写真がない / 公開する", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await draftWithSteward(k, { photoIds: [] });
    await k.suspend(o, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.publish(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("publishOccasion#15 操作する人はイベント運営者。イベントは draft で公開条件を満たす。公開と、別の運営者のイベント情報の保存が同時に確定する / 公開する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await draftWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const racing = commitAfter(k.container, () =>
      k.update(other, occasion.id, { description: "先に確定" }),
    );
    await expectCode(k.publish(s, occasion.id, racing), ConflictError);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.publication.status).toBe("draft");
    expect(after.content.description).toBe("先に確定");
  });
});
