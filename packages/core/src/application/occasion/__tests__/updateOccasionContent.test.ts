import { PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { expectCode, rejection } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { updateOccasionContent } from "../updateOccasionContent";
import { fields, occasionKit, Towns } from "./kit";

/** An occasion operator of a published occasion registered by an operator. */
async function publishedWithSteward(
  k: Awaited<ReturnType<typeof occasionKit>>,
) {
  const o = await k.operator();
  const occasion = await k.published(o);
  const s = await k.steward(occasion.id);
  return { o, s, occasion };
}

describe("updateOccasionContent", () => {
  it("updateOccasionContent#1 操作する人はイベント運営者。イベントは公開中で、公開条件を満たす / 紹介とキャッチコピーを書き換え、編集を始めたときの版を添えて保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    const view = await k.update(s, occasion.id, {
      description: "新しい紹介",
      tagline: "新しいキャッチコピー",
    });
    const after = (await k.stored(occasion.id)).entity;
    expect(after.content.description).toBe("新しい紹介");
    expect(after.content.tagline).toBe("新しいキャッチコピー");
    expect(after.version).toBe(before.version + 1);
    expect(after.publication).toEqual(before.publication);
    expect(view.publication.status).toBe("published");
    expect(await k.events("occasion.period_changed")).toEqual([]);
  });

  it("updateOccasionContent#2 操作する人はイベント運営者。イベントは公開中で、開催期間は過ぎていて開催の状態は終了。店舗 P が期間内の参加日を添えて参加中 / 開催期間を未来の日付に更新して保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const p = await k.place();
    const details = {
      listingIds: [],
      dates: [LocalDate.parse("2026-10-02")],
    };
    const before = await k.participate(occasion.id, p, details);
    k.setToday("2026-10-10");
    expect((await k.get(s, occasion.id)).holdingStatus).toBe("ended");
    const view = await k.update(s, occasion.id, {
      period: { start: "2026-10-20", end: "2026-10-22" },
    });
    expect(view.period).toEqual({ start: "2026-10-20", end: "2026-10-22" });
    expect(view.holdingStatus).toBe("upcoming");
    const events = await k.events("occasion.period_changed");
    expect(events.map((e) => e.payload)).toEqual([{ occasionId: occasion.id }]);
    expect(await k.participation(occasion.id, p)).toEqual(before);
  });

  it("updateOccasionContent#3 操作する人はイベント運営者。イベントは中止中 / 開催期間を更新して保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    await k.cancel(s, occasion.id);
    const view = await k.update(s, occasion.id, {
      period: { start: "2026-11-01", end: "2026-11-02" },
    });
    expect(view.period).toEqual({ start: "2026-11-01", end: "2026-11-02" });
    expect(view.cancelled).toBe(true);
    expect(view.holdingStatus).toBe("cancelled");
    expect(await k.events("occasion.period_changed")).toHaveLength(1);
  });

  it("updateOccasionContent#4 操作する人はイベント運営者。イベントは公開中で、写真 A・B を A、B の順に持つ。写真 C は操作する人が登録した持ち主のない写真 / 写真を C、B の順にして保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const [a, b] = await k.photos(o, 2);
    if (a === undefined || b === undefined) throw new Error("photos");
    const occasion = await k.published(o, { photoIds: [a, b] });
    const s = await k.steward(occasion.id);
    const c = await k.photo(s);
    const bBefore = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(b),
    );
    const view = await k.update(s, occasion.id, { photoIds: [c, b] });
    expect(view.photos.map((p) => p.photoId)).toEqual([c, b]);
    expect(await k.photoOwner(c)).toEqual({
      kind: "occasion",
      id: occasion.id,
    });
    const released = await k.events("photos.released");
    expect(released.map((e) => e.payload)).toEqual([{ photoIds: [a] }]);
    const bAfter = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(b),
    );
    expect(bAfter?.expectedVersion).toBe(bBefore?.expectedVersion);
  });

  it("updateOccasionContent#5 操作する人はイベント運営者。イベントは公開中 / 写真をすべて外して保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    const error = await rejection(k.update(s, occasion.id, { photoIds: [] }));
    expect(error).toMatchObject({
      code: "OCCASION_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.events("photos.released")).toEqual([]);
  });

  it("updateOccasionContent#6 操作する人はイベント運営者。イベントは公開の取り下げ中 / 名称と写真を外して保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    await k.unpublish(s, occasion.id);
    const view = await k.update(s, occasion.id, { name: null, photoIds: [] });
    expect(view.name).toBeNull();
    expect(view.photos).toEqual([]);
    expect(view.publication.status).toBe("unpublished");
    expect(view.missingRequirements).toEqual(["name", "photos"]);
  });

  it("updateOccasionContent#7 操作する人はイベント運営者。イベントは公開中で、運営による非公開 / 紹介を書き換えて保存する", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await publishedWithSteward(k);
    await k.suspend(o, occasion.id);
    const view = await k.update(s, occasion.id, { description: "書き換え" });
    expect(view.description).toBe("書き換え");
    expect(view.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
  });

  it("updateOccasionContent#8 操作する人はイベント運営者 / 終了日が開始日より前の開催期間で保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await expect(
      k.update(s, occasion.id, {
        period: { start: "2026-10-05", end: "2026-10-04" },
      }),
    ).rejects.toMatchObject({ code: "COMMON_INVALID_DATE_RANGE" });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("updateOccasionContent#9 操作する人はイベント運営者。編集を始めた後に、別の運営者がイベント情報を保存して版が進んでいる / 編集を始めたときの版を添えて保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const started = (await k.stored(occasion.id)).entity.version;
    await k.update(other, occasion.id, { description: "先の保存" });
    await expectCode(
      k.update(
        s,
        occasion.id,
        { description: "後の保存" },
        { version: started },
      ),
      ConflictError,
    );
    expect((await k.stored(occasion.id)).entity.content.description).toBe(
      "先の保存",
    );
  });

  it("updateOccasionContent#10 イベントにイベント運営者がいない。操作する人はサービス運営者 / イベント情報を書き換えて保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const view = await k.update(o, occasion.id, { description: "代行の保存" });
    expect(view.description).toBe("代行の保存");
    expect(view.access).toEqual({
      hasSteward: false,
      manageable: true,
      basis: "absence_proxy",
    });
  });

  it("updateOccasionContent#11 イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 / イベント情報を書き換えて保存する", async () => {
    const k = await occasionKit();
    const { o, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(
      k.update(o, occasion.id, { description: "代行" }),
      ForbiddenError,
    );
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("updateOccasionContent#12 操作する人は、編集を始めた後にそのイベントの管理権限を解除された利用者 / イベント情報を書き換えて保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const started = (await k.stored(occasion.id)).entity.version;
    await k.removeSteward(k.ref(occasion.id), s);
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(
      k.update(s, occasion.id, { description: "解除後" }, { version: started }),
      ForbiddenError,
    );
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("updateOccasionContent#13 操作する人は、別のイベントの管理権限だけを持つ利用者 / イベント情報を書き換えて保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const target = await k.published(o);
    const elsewhere = await k.register(o);
    const who = await k.steward(elsewhere.id);
    await expectCode(
      k.update(who, target.id, { description: "越権" }),
      ForbiddenError,
    );
  });

  it("updateOccasionContent#14 指定した ID のイベントがない / イベント情報を保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(
      updateOccasionContent({
        container: k.container,
        actor: o.actor,
        input: {
          occasionId: k.unknownOccasion(),
          version: 0,
          content: fields(),
        },
      }),
      NotFoundError,
    );
  });

  it("updateOccasionContent#15 操作する人はイベント運営者。イベントは、申立てによって写真 A・B から A が削除され、写真は B / 写真の並びを B のまま、紹介だけを書き換えて保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const [a, b] = await k.photos(o, 2);
    if (a === undefined || b === undefined) throw new Error("photos");
    const occasion = await k.published(o, { photoIds: [a, b] });
    const s = await k.steward(occasion.id);
    await k.takeDown(occasion.id, [a]);
    await k.update(s, occasion.id, { description: "紹介だけ" });
    const view = await k.get(s, occasion.id);
    expect(view.description).toBe("紹介だけ");
    expect(view.photos.map((p) => p.photoId)).toEqual([b]);
    expect(view.photosTakenDown).toBe(true);
  });

  it("updateOccasionContent#16 操作する人はイベント運営者。選んだ町域が AreaCatalog にない / その町域を開催場所にして保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await expect(
      k.update(s, occasion.id, {
        address: { town: Towns.missing, rest: "1-1" },
      }),
    ).rejects.toMatchObject({ code: "AREA_TOWN_NOT_FOUND" });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("updateOccasionContent#17 操作する人はイベント運営者。載せる写真 D は、別の人が登録した写真 / 写真 D を載せ、名称も変えて保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.person("other");
    const d = await k.photo(other);
    const before = (await k.stored(occasion.id)).entity;
    await expect(
      k.update(s, occasion.id, {
        name: "新しい名称",
        photoIds: [...before.content.photos.items.map((p) => p.photoId), d],
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_NOT_REGISTRANT" });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.photoOwner(d)).toBeNull();
  });

  it("updateOccasionContent#18 操作する人はイベント運営者。載せる写真の1枚は、存在しない PhotoId / その写真を載せて保存する", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await expect(
      k.update(s, occasion.id, {
        photoIds: [
          ...before.content.photos.items.map((p) => p.photoId),
          PhotoId.create(k.newId()),
        ],
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_NOT_AVAILABLE" });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("updateOccasionContent#19 操作する人はイベント運営者。自分が登録した写真 E は、すでに別のイベントが持ち主 / 写真 E を載せて保存する", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const other = await k.register(o);
    const s = await k.steward(occasion.id);
    await k.appoint(k.ref(other.id), s);
    const e = await k.photo(s);
    await k.update(s, other.id, {
      photoIds: [...other.photos.map((p) => p.photoId), e],
    });
    const before = (await k.stored(occasion.id)).entity;
    await expect(
      k.update(s, occasion.id, {
        photoIds: [...before.content.photos.items.map((p) => p.photoId), e],
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PHOTO_ALREADY_OWNED" });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.photoOwner(e)).toEqual({ kind: "occasion", id: other.id });
  });

  it("changes nothing when the content is the same", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await k.update(s, occasion.id, {});
    const after = (await k.stored(occasion.id)).entity;
    expect(after).toEqual(before);
    expect(Occasion.missingRequirements(after.content)).toEqual([]);
  });

  it("judges an invalid input value before a stale version", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const started = (await k.stored(occasion.id)).entity.version;
    await k.update(other, occasion.id, { description: "先の保存" });
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(
      k.update(
        s,
        occasion.id,
        { period: { start: "2026-10-05", end: "2026-10-04" } },
        { version: started },
      ),
      BusinessRuleError,
      "COMMON_INVALID_DATE_RANGE",
    );
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });
});
