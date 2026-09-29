import { OccasionId, PhotoId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { registerOccasion } from "../registerOccasion";
import { fields, nameOnly, occasionKit, Towns } from "./kit";

describe("registerOccasion", () => {
  it("registerOccasion#1 操作する人はサービス運営者。イベント運営者にするアカウントは決まっていない / 名称・開催期間・開催場所（町域と位置）・紹介・キャッチコピーと、自分が登録した持ち主のない写真2枚を載せて登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const [first, second] = await k.photos(o, 2);
    if (first === undefined || second === undefined) throw new Error("photos");
    const id = k.newId();
    const view = await registerOccasion({
      container: k.container,
      actor: o.actor,
      input: {
        occasionId: id,
        content: fields({
          address: { town: Towns.ginza, rest: "2-2" },
          photoIds: [first, second],
          description: "秋の市場です",
          tagline: "今年も開催",
        }),
      },
    });
    const stored = (await k.stored(OccasionId.create(id))).entity;
    expect(stored.publication).toEqual({ status: "draft" });
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.cancellation).toEqual({ cancelled: false });
    expect(stored.content.venue.address?.areaCode).toBe(Towns.ginza.areaCode);
    expect(stored.content.photos.items.map((p) => p.photoId)).toEqual([
      first,
      second,
    ]);
    const owner = { kind: "occasion", id };
    expect(await k.photoOwner(first)).toEqual(owner);
    expect(await k.photoOwner(second)).toEqual(owner);
    expect(await k.events()).toEqual([]);
    expect(view.missingRequirements).toEqual([]);
    expect(view.photos[0]?.photoId).toBe(first);
    expect(view.access.hasSteward).toBe(false);
  });

  it("registerOccasion#2 操作する人はサービス運営者 / 名称だけを入力して登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    const view = await registerOccasion({
      container: k.container,
      actor: o.actor,
      input: { occasionId: id, content: nameOnly("冬の市") },
    });
    expect(view.publication.status).toBe("draft");
    expect(view.missingRequirements).toEqual(["period", "venue", "photos"]);
    expect((await k.stored(OccasionId.create(id))).entity.content.name).toBe(
      "冬の市",
    );
  });

  it("registerOccasion#3 操作する人はサービス運営者。同じ OccasionId と同じイベント情報での登録が成立している / 同じ OccasionId と同じイベント情報で、もう一度登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const photo = await k.photo(o);
    const id = k.newId();
    const input = {
      occasionId: id,
      content: fields({ photoIds: [photo] }),
    };
    await registerOccasion({ container: k.container, actor: o.actor, input });
    const before = await k.stored(OccasionId.create(id));
    const photoBefore = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(photo),
    );
    const mark = await k.mark();
    const view = await registerOccasion({
      container: k.container,
      actor: o.actor,
      input,
    });
    expect(view.id).toBe(id);
    const after = await k.stored(OccasionId.create(id));
    expect(after.entity.version).toBe(before.entity.version);
    const photoAfter = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(photo),
    );
    expect(photoAfter?.expectedVersion).toBe(photoBefore?.expectedVersion);
    expect(await k.since(mark)).toEqual([]);
  });

  it("registerOccasion#4 操作する人はサービス運営者。同じ OccasionId のイベントがある / 同じ OccasionId で、名称の違うイベント情報を登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    await registerOccasion({
      container: k.container,
      actor: o.actor,
      input: { occasionId: id, content: nameOnly("元の名称") },
    });
    await expectCode(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: { occasionId: id, content: nameOnly("別の名称") },
      }),
      ConflictError,
    );
    expect((await k.stored(OccasionId.create(id))).entity.content.name).toBe(
      "元の名称",
    );
  });

  it("registerOccasion#5 操作する人はサービス運営者 / 終了日が開始日より前の開催期間で登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    await expect(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: {
          occasionId: id,
          content: fields({
            period: { start: "2026-10-03", end: "2026-10-01" },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "COMMON_INVALID_DATE_RANGE" });
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
  });

  it("registerOccasion#6 操作する人はサービス運営者。写真 A は別の人が登録した持ち主のない写真 / 写真 A を載せて登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const other = await k.person("other");
    const a = await k.photo(other);
    const id = k.newId();
    await expect(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: { occasionId: id, content: fields({ photoIds: [a] }) },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_NOT_REGISTRANT" });
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
    expect(await k.photoOwner(a)).toBeNull();
  });

  it("registerOccasion#7 操作する人はサービス運営者 / 存在しない PhotoId を載せて登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    await expect(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: {
          occasionId: id,
          content: fields({ photoIds: [PhotoId.create(k.newId())] }),
        },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_NOT_AVAILABLE" });
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
  });

  it("registerOccasion#8 操作する人は、サービス運営者の役割を持たない利用者（編集担当者の役割と、別のイベントの管理権限は持つ） / イベント情報を入力して登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const elsewhere = await k.register(o);
    const who = await k.steward(elsewhere.id);
    await k.editors(who);
    const id = k.newId();
    await expectCode(
      registerOccasion({
        container: k.container,
        actor: who.actor,
        input: { occasionId: id, content: nameOnly("市") },
      }),
      ForbiddenError,
    );
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
  });

  it("registerOccasion#9 操作する人はサービス運営者。選んだ町域が AreaCatalog にない / その町域を開催場所にして登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const id = k.newId();
    await expect(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: {
          occasionId: id,
          content: fields({ address: { town: Towns.missing, rest: "1-1" } }),
        },
      }),
    ).rejects.toMatchObject({ code: "AREA_TOWN_NOT_FOUND" });
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
  });

  it("registerOccasion#10 操作する人はサービス運営者。自分が登録した写真のうち1枚は、すでに別のイベントが持ち主 / その写真を含むイベント情報で登録する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const [owned, fresh] = await k.photos(o, 2);
    if (owned === undefined || fresh === undefined) throw new Error("photos");
    const other = await k.register(o, { photoIds: [owned] });
    const id = k.newId();
    await expect(
      registerOccasion({
        container: k.container,
        actor: o.actor,
        input: {
          occasionId: id,
          content: fields({ photoIds: [fresh, owned] }),
        },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_ALREADY_OWNED" });
    expect(
      await k.run(({ occasionRepository }) =>
        occasionRepository.findById(OccasionId.create(id)),
      ),
    ).toBeNull();
    expect(await k.photoOwner(fresh)).toBeNull();
    expect(await k.photoOwner(owned)).toEqual({
      kind: "occasion",
      id: other.id,
    });
  });
});
