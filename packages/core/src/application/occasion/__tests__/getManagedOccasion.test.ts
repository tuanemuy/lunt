import { OccasionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { registerOccasion } from "../registerOccasion";
import { nameOnly, occasionKit } from "./kit";

type K = Awaited<ReturnType<typeof occasionKit>>;

/** A published occasion with photos A and B, and its occasion operator. */
async function withTwoPhotos(k: K) {
  const o = await k.operator();
  const [a, b] = await k.photos(o, 2);
  if (a === undefined || b === undefined) throw new Error("photos");
  const occasion = await k.published(o, { photoIds: [a, b] });
  const s = await k.steward(occasion.id);
  return { o, s, occasion, a, b };
}

describe("getManagedOccasion", () => {
  it("getManagedOccasion#1 操作する人はイベント O の運営者。イベント O は公開中で、今日は開催期間の中 / 管理するイベントを確かめる", async () => {
    const k = await occasionKit({ today: "2026-10-02" });
    const o = await k.operator();
    const occasion = await k.published(o, { description: "紹介" });
    const s = await k.steward(occasion.id);
    const view = await k.get(s, occasion.id);
    expect(view).toMatchObject({
      id: occasion.id,
      name: "秋のマルシェ",
      description: "紹介",
      period: { start: "2026-10-01", end: "2026-10-03" },
      publication: { status: "published" },
      suspended: false,
      cancelled: false,
      holdingStatus: "ongoing",
      viewable: true,
      missingRequirements: [],
      photosTakenDown: false,
      access: { hasSteward: true, manageable: true, basis: "steward" },
    });
    expect(view.photos).toHaveLength(1);
    expect(view.photos[0]?.display).not.toBeNull();
  });

  it("getManagedOccasion#2 操作する人はイベント O の運営者。イベント O は draft で、名称だけを持つ / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    await registerOccasion({
      container: k.container,
      actor: o.actor,
      input: { occasionId: id, content: nameOnly("名称だけ") },
    });
    const occasionId = OccasionId.create(id);
    const s = await k.steward(occasionId);
    const view = await k.get(s, occasionId);
    expect(view.publication).toEqual({ status: "draft" });
    expect(view.missingRequirements).toEqual(["period", "venue", "photos"]);
    expect(view.holdingStatus).toBeNull();
  });

  it("getManagedOccasion#3 操作する人はイベント O の運営者。イベント O は、申立てによる最後の写真の削除で公開の取り下げになった / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    const [photo] = occasion.photos;
    if (photo === undefined) throw new Error("photo");
    await k.takeDown(occasion.id, [photo.photoId]);
    const view = await k.get(s, occasion.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(view.missingRequirements).toEqual(["photos"]);
    expect(view.photosTakenDown).toBe(true);
  });

  it("getManagedOccasion#4 操作する人はイベント O の運営者。イベント O は公開中で、申立てによって写真 A・B から A が削除された / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const { s, occasion, a, b } = await withTwoPhotos(k);
    await k.takeDown(occasion.id, [a]);
    const view = await k.get(s, occasion.id);
    expect(view.publication.status).toBe("published");
    expect(view.photos.map((p) => p.photoId)).toEqual([b]);
    expect(view.photosTakenDown).toBe(true);
  });

  it("getManagedOccasion#5 上のイベント O で、イベント運営者が写真を B・C の並びにして保存した / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const { s, occasion, a, b } = await withTwoPhotos(k);
    await k.takeDown(occasion.id, [a]);
    const c = await k.photo(s);
    await k.update(s, occasion.id, { photoIds: [b, c] });
    const view = await k.get(s, occasion.id);
    expect(view.photos.map((p) => p.photoId)).toEqual([b, c]);
    expect(view.photosTakenDown).toBe(false);
  });

  it("getManagedOccasion#6 操作する人はイベント O の運営者。イベント O は公開中で、運営による非公開、中止中 / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    await k.cancel(s, occasion.id);
    const view = await k.get(s, occasion.id);
    expect(view.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
    expect(view.cancelled).toBe(true);
    expect(view.holdingStatus).toBe("cancelled");
    expect(view.viewable).toBe(false);
  });

  it("getManagedOccasion#7 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const view = await k.get(o, occasion.id);
    expect(view.name).toBe("秋のマルシェ");
    expect(view.publication.status).toBe("published");
    expect(view.access).toEqual({
      hasSteward: false,
      manageable: true,
      basis: "absence_proxy",
    });
  });

  it("getManagedOccasion#8 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者。イベント O は公開中で運営による非公開 / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    const view = await k.get(o, occasion.id);
    expect(view.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
    expect(view.access).toEqual({
      hasSteward: true,
      manageable: false,
      basis: null,
    });
  });

  it("getManagedOccasion#9 操作する人は、イベント O の管理権限も、サービス運営者の役割も持たない利用者（管理権限を解除された人、編集担当者を含む） / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const removed = await k.steward(occasion.id, "removed");
    await k.steward(occasion.id, "remaining");
    await k.removeSteward(k.ref(occasion.id), removed);
    const editor = await k.person("editor");
    await k.editors(editor);
    const stranger = await k.person("stranger");
    for (const who of [removed, editor, stranger]) {
      await expectCode(k.get(who, occasion.id), ForbiddenError);
    }
  });

  it("getManagedOccasion#10 指定した ID のイベントがない / 管理するイベントを確かめる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.get(o, k.unknownOccasion()), NotFoundError);
  });
});
