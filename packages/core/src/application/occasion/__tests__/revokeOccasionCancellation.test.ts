import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  rejection,
} from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { occasionKit } from "./kit";

type K = Awaited<ReturnType<typeof occasionKit>>;

/** A cancelled published occasion (10/1〜10/3) and its occasion operator. */
async function cancelledWithSteward(k: K) {
  const o = await k.operator();
  const occasion = await k.published(o);
  const s = await k.steward(occasion.id);
  await k.cancel(s, occasion.id);
  return { o, s, occasion };
}

describe("revokeOccasionCancellation", () => {
  it("revokeOccasionCancellation#1 操作する人はイベント運営者。イベントは中止中で、今日は開催期間の開始日より前 / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    const mark = await k.mark();
    const view = await k.revoke(s, occasion.id);
    expect(view.cancelled).toBe(false);
    expect(view.holdingStatus).toBe("upcoming");
    expect(await k.since(mark)).toEqual([]);
  });

  it("revokeOccasionCancellation#2 操作する人はイベント運営者。イベントは中止中で、今日は開催期間の中 / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    k.setToday("2026-10-02");
    expect((await k.revoke(s, occasion.id)).holdingStatus).toBe("ongoing");
  });

  it("revokeOccasionCancellation#3 操作する人はイベント運営者。イベントは中止中で、開催期間を過ぎている / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    k.setToday("2026-10-04");
    const view = await k.revoke(s, occasion.id);
    expect(view.cancelled).toBe(false);
    expect(view.holdingStatus).toBe("ended");
  });

  it("revokeOccasionCancellation#4 操作する人はイベント運営者。イベントは中止中で、運営による非公開 / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { o, s, occasion } = await cancelledWithSteward(k);
    await k.suspend(o, occasion.id);
    const view = await k.revoke(s, occasion.id);
    expect(view.cancelled).toBe(false);
    expect(view.suspended).toBe(true);
    expect(view.publication.status).toBe("published");
  });

  it("revokeOccasionCancellation#5 操作する人はイベント運営者。中止を取り消した後のイベント / cancelOccasion で再び中止にする", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    await k.revoke(s, occasion.id);
    const view = await k.cancel(s, occasion.id);
    expect(view.cancelled).toBe(true);
    expect(await k.events("occasion.cancelled")).toHaveLength(2);
  });

  it("revokeOccasionCancellation#6 操作する人はイベント運営者。別の運営者がすでに中止を取り消している / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    await k.revoke(other, occasion.id);
    const before = (await k.stored(occasion.id)).entity;
    await expect(k.revoke(s, occasion.id)).rejects.toMatchObject({
      code: "OCCASION_NOT_CANCELLED",
    });
    expect((await k.stored(occasion.id)).entity).toEqual(before);
  });

  it("revokeOccasionCancellation#7 イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { o, occasion } = await cancelledWithSteward(k);
    await expectCode(k.revoke(o, occasion.id), ForbiddenError);
  });

  it("revokeOccasionCancellation#8 操作する人は、そのイベントの管理権限を持たない利用者 / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { occasion } = await cancelledWithSteward(k);
    const stranger = await k.person("stranger");
    await expectCode(k.revoke(stranger, occasion.id), ForbiddenError);
  });

  it("revokeOccasionCancellation#9 指定した ID のイベントがない / 中止を取り消す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await expectCode(k.revoke(o, k.unknownOccasion()), NotFoundError);
  });

  it("revokeOccasionCancellation#10 操作する人はイベント運営者。イベントは中止でない。別の運営者の中止と同時に実行し、どちらも中止にする前のイベントを読む / 中止を取り消す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.published(o);
    const s = await k.steward(occasion.id);
    const other = await k.steward(occasion.id, "other");
    let outcome: unknown;
    const racing = commitAfter(k.container, async () => {
      outcome = await rejection(k.revoke(s, occasion.id));
    });
    await k.cancel(other, occasion.id, racing);
    expect(outcome).toMatchObject({ code: "OCCASION_NOT_CANCELLED" });
    expect((await k.stored(occasion.id)).entity.cancellation).toEqual({
      cancelled: true,
    });
  });

  it("revokeOccasionCancellation#11 操作する人はイベント運営者。イベントは中止中。別の運営者の中止の取り消しが同時に確定する / 中止を取り消す", async () => {
    const k = await occasionKit();
    const { s, occasion } = await cancelledWithSteward(k);
    const other = await k.steward(occasion.id, "other");
    const winner = { version: 0 };
    const racing = commitAfter(k.container, async () => {
      winner.version = (await k.revoke(other, occasion.id)).version;
    });
    await expectCode(k.revoke(s, occasion.id, racing), ConflictError);
    const after = (await k.stored(occasion.id)).entity;
    expect(after.cancellation).toEqual({ cancelled: false });
    expect(after.version).toBe(winner.version);
  });
});
