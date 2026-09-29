import { RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { occasionKit } from "./kit";

type K = Awaited<ReturnType<typeof occasionKit>>;

/** A published occasion registered by an operator, and its occasion operator. */
async function publishedWithSteward(k: K) {
  const o = await k.operator();
  const occasion = await k.published(o);
  const s = await k.steward(occasion.id);
  return { o, s, occasion };
}

describe("unpublishOccasion", () => {
  it("unpublishOccasion#1 操作する人はイベント運営者。イベントは公開中。店舗 P が参加中で、地域 R が関連づけ中 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const p = await k.place();
    const participation = await k.participate(occasion.id, p);
    const r = RegionId.create(k.newId());
    const link = await k.link(occasion.id, r);
    const view = await k.unpublish(s, occasion.id);
    expect(view.publication).toEqual({
      status: "unpublished",
      firstPublishedAt:
        occasion.publication.status === "published"
          ? occasion.publication.firstPublishedAt
          : null,
      reason: "byManager",
    });
    const events = await k.events("occasion.unpublished");
    expect(events.map((e) => e.payload)).toEqual([
      { occasionId: occasion.id, reason: "byManager" },
    ]);
    expect(await k.participation(occasion.id, p)).toEqual(participation);
    expect(await k.regionLink(occasion.id, r)).toEqual(link);
  });

  it("unpublishOccasion#2 イベントにイベント運営者がいない。操作する人はサービス運営者。イベントは公開中 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const view = await k.unpublish(o, occasion.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unpublishOccasion#3 操作する人はイベント運営者。イベントは公開中で、運営による非公開 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await publishedWithSteward(k);
    await k.suspend(o, occasion.id);
    const mark = await k.mark();
    await expect(k.unpublish(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity.publication.status).toBe(
      "published",
    );
    expect(await k.since(mark)).toEqual([]);
  });

  it("unpublishOccasion#4 操作する人はイベント運営者。イベントは draft / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.register(o);
    const s = await k.steward(occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.unpublish(s, occasion.id)).rejects.toMatchObject({
      code: "COMMON_PUBLICATION_INVALID_TRANSITION",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.events()).toEqual([]);
  });

  it("unpublishOccasion#5 操作する人はイベント運営者。イベントは別の運営者の操作ですでに unpublished / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    await k.unpublish(other, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    const mark = await k.mark();
    await expect(k.unpublish(s, occasion.id)).rejects.toMatchObject({
      code: "COMMON_PUBLICATION_INVALID_TRANSITION",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("unpublishOccasion#6 イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { o, occasion } = await publishedWithSteward(k);
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(k.unpublish(o, occasion.id), ForbiddenError);
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("unpublishOccasion#7 操作する人は、そのイベントの管理権限を持たない利用者 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { occasion } = await publishedWithSteward(k);
    const stranger = await k.person("stranger");
    await expectCode(k.unpublish(stranger, occasion.id), ForbiddenError);
  });

  it("unpublishOccasion#8 指定した ID のイベントがない / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.unpublish(o, k.unknownOccasion()), NotFoundError);
  });

  it("unpublishOccasion#9 操作する人はイベント運営者。イベントは公開の取り下げ中で、運営による非公開 / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await publishedWithSteward(k);
    await k.unpublish(s, occasion.id);
    await k.suspend(o, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.unpublish(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_SUSPENDED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("unpublishOccasion#10 操作する人はイベント運営者。イベントは公開中。公開の取り下げと、別の運営者のイベント情報の保存が同時に確定する / 公開を取り下げる", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const racing = commitAfter(k.container, () =>
      k.update(other, occasion.id, { description: "先に確定" }),
    );
    await expectCode(k.unpublish(s, occasion.id, racing), ConflictError);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.publication.status).toBe("published");
    expect(after.content.description).toBe("先に確定");
    expect(await k.events("occasion.unpublished")).toEqual([]);
  });
});
