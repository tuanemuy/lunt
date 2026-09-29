import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  rejection,
} from "../../authority/__tests__/kit";
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

describe("cancelOccasion", () => {
  it("cancelOccasion#1 操作する人はイベント運営者。イベントは公開中で、開催前。店舗 P が参加中 / 中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const p = await k.place();
    const participation = await k.participate(occasion.id, p);
    expect(occasion.holdingStatus).toBe("upcoming");
    const view = await k.cancel(s, occasion.id);
    expect(view.cancelled).toBe(true);
    expect(view.holdingStatus).toBe("cancelled");
    expect(view.publication.status).toBe("published");
    expect(
      (await k.events("occasion.cancelled")).map((e) => e.payload),
    ).toEqual([{ occasionId: occasion.id }]);
    expect(await k.participation(occasion.id, p)).toEqual(participation);
  });

  it("cancelOccasion#2 操作する人はイベント運営者。イベントは開催期間を過ぎていて、開催の状態は終了 / 中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    k.setToday("2026-10-10");
    expect((await k.get(s, occasion.id)).holdingStatus).toBe("ended");
    const view = await k.cancel(s, occasion.id);
    expect(view.holdingStatus).toBe("cancelled");
    expect(await k.events("occasion.cancelled")).toHaveLength(1);
  });

  it("cancelOccasion#3 操作する人はイベント運営者。イベントは draft で、運営による非公開 / 中止にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.register(o);
    const s = await k.steward(occasion.id);
    await k.suspend(o, occasion.id);
    const view = await k.cancel(s, occasion.id);
    expect(view.cancelled).toBe(true);
    expect(view.publication.status).toBe("draft");
    expect(view.suspended).toBe(true);
  });

  it("cancelOccasion#4 イベントにイベント運営者がいない。操作する人はサービス運営者 / 中止にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const view = await k.cancel(o, occasion.id);
    expect(view.cancelled).toBe(true);
    expect(view.access.basis).toBe("absence_proxy");
  });

  it("cancelOccasion#5 操作する人はイベント運営者。別の運営者がすでに中止にしている / 中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    await k.cancel(other, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.cancel(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_ALREADY_CANCELLED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
    expect(await k.events("occasion.cancelled")).toHaveLength(1);
  });

  it("cancelOccasion#6 イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 / 中止にする", async () => {
    const k = await occasionKit();
    const { o, occasion } = await publishedWithSteward(k);
    await expectCode(k.cancel(o, occasion.id), ForbiddenError);
  });

  it("cancelOccasion#7 操作する人は、そのイベントの管理権限を持たない利用者 / 中止にする", async () => {
    const k = await occasionKit();
    const { occasion } = await publishedWithSteward(k);
    const stranger = await k.person("stranger");
    const before = (await k.stored(occasion.id)).entity;
    await expectCode(k.cancel(stranger, occasion.id), ForbiddenError);
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("cancelOccasion#8 指定した ID のイベントがない / 中止にする", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.cancel(o, k.unknownOccasion()), NotFoundError);
  });

  it("cancelOccasion#9 操作する人はイベント運営者。イベントは中止中。別の運営者の中止の取り消しと同時に実行し、どちらも取り消す前のイベントを読む / 中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    await k.cancel(other, occasion.id);
    let outcome: unknown;
    const racing = commitAfter(k.container, async () => {
      outcome = await rejection(k.cancel(s, occasion.id));
    });
    await k.revoke(other, occasion.id, racing);
    expect(outcome).toMatchObject({ code: "OCCASION_ALREADY_CANCELLED" });
    expect((await k.stored(occasion.id)).entity.cancellation).toEqual({
      cancelled: false,
    });
  });

  it("cancelOccasion#10 操作する人はイベント運営者。イベントは中止でない。別の運営者の中止が同時に確定する / 中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await publishedWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const racing = commitAfter(k.container, () => k.cancel(other, occasion.id));
    await expectCode(k.cancel(s, occasion.id, racing), ConflictError);
    expect((await k.stored(occasion.id)).entity.cancellation).toEqual({
      cancelled: true,
    });
    expect(await k.events("occasion.cancelled")).toHaveLength(1);
  });
});
