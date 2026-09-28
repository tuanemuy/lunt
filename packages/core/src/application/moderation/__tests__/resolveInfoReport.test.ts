import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { revokeSteward } from "../../authority/revokeSteward";
import { ConflictError, ForbiddenError } from "../../errors";
import { type ModerationKit, moderationKit } from "./kit";

/** An open report about a place with one steward. */
async function openReport(k: ModerationKit) {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const reportId = await k.report(await k.person(), {
    target: { kind: "place", placeId },
  });
  return { placeId, m, reportId };
}

describe("resolveInfoReport", () => {
  it("resolveInfoReport#1 未対応の連絡がある。操作する人はサービス運営者 / 確認を依頼せずに対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { reportId } = await openReport(k);
    const before = (await k.storedReport(reportId)).entity;
    const mark = await k.mark();
    const view = await k.resolveReport(op, reportId);
    expect((await k.storedReport(reportId)).entity).toEqual({
      ...before,
      status: "resolved",
      request: null,
      version: before.version + 1,
    });
    expect(view).toMatchObject({ status: "resolved", requestedAt: null });
    expect(await k.since(mark)).toEqual([]);
    expect((await k.unresolved(op)).count).toBe(0);
  });

  it("resolveInfoReport#2 確認依頼中の連絡がある / サービス運営者が対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId, m, reportId } = await openReport(k);
    await k.request(op, reportId);
    const requested = (await k.storedReport(reportId)).entity;
    if (requested.status !== "confirmationRequested") throw new Error("state");
    const mark = await k.mark();
    await k.resolveReport(op, reportId);
    expect((await k.storedReport(reportId)).entity).toMatchObject({
      status: "resolved",
      request: requested.request,
    });
    expect(await k.since(mark)).toEqual([]);
    expect((await k.unresolved(op)).count).toBe(0);
    expect((await k.requestsFor(m, placeId)).count).toBe(0);
    expect(await k.readRequest(m, reportId)).toMatchObject({
      status: "resolved",
      requestedAt: requested.request.requestedAt,
    });
  });

  it("resolveInfoReport#3 確認依頼中の連絡の対象の店舗で、すべての店舗管理者の権限が解除され、管理者のいない店舗になっている / サービス運営者が対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId, m, reportId } = await openReport(k);
    await k.request(op, reportId);
    await revokeSteward({
      container: k.container,
      actor: op.actor,
      input: { target: k.ref(placeId), accountId: m.accountId },
    });
    const stewardship = await k.findStewardship(k.ref(placeId));
    await k.resolveReport(op, reportId);
    expect((await k.storedReport(reportId)).entity.status).toBe("resolved");
    expect(await k.findStewardship(k.ref(placeId))).toEqual(stewardship);
  });

  it("resolveInfoReport#4 未対応の連絡の対象の掲載が削除されている / サービス運営者が、依頼せずに対応を終える", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.published(m, placeId);
    const reportId = await k.report(await k.person(), {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.remove(m, listing.id);
    await k.resolveReport(await k.operator(), reportId);
    expect((await k.storedReport(reportId)).entity.status).toBe("resolved");
  });

  it("resolveInfoReport#5 未対応の連絡の対象の店舗が非公開になっている / サービス運営者が対応を終える", async () => {
    const k = await moderationKit();
    const { placeId, reportId } = await openReport(k);
    await k.suspendPlace(placeId);
    await k.resolveReport(await k.operator(), reportId);
    expect((await k.storedReport(reportId)).entity.status).toBe("resolved");
  });

  it("resolveInfoReport#6 対応済みの連絡がある / サービス運営者が対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { reportId } = await openReport(k);
    await k.resolveReport(op, reportId);
    const before = await k.storedReport(reportId);
    await expectCode(
      k.resolveReport(op, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_ALREADY_RESOLVED",
    );
    expect(await k.storedReport(reportId)).toEqual(before);
  });

  it("resolveInfoReport#7 サービス運営者 A と B が、同じ未対応の連絡を読んだ。B が先に確認を依頼した / A が対応を終える", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { reportId } = await openReport(k);
    await k.readReport(opA, reportId);
    await k.readReport(opB, reportId);
    const requestedAt = k.tick();
    await k.request(opB, reportId);
    await k.resolveReport(opA, reportId);
    expect((await k.storedReport(reportId)).entity).toMatchObject({
      status: "resolved",
      request: { requestedAt },
    });
  });

  it("resolveInfoReport#8 サービス運営者 A と B が、同じ確認依頼中の連絡を読んだ。B が先に対応を終えた / A が対応を終える", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { reportId } = await openReport(k);
    await k.request(opB, reportId);
    await k.readReport(opA, reportId);
    await k.readReport(opB, reportId);
    await k.resolveReport(opB, reportId);
    const afterB = await k.storedReport(reportId);
    await expectCode(
      k.resolveReport(opA, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_ALREADY_RESOLVED",
    );
    expect(await k.storedReport(reportId)).toEqual(afterB);
  });

  it("resolveInfoReport#9 サービス運営者 A と B の、同じ未対応の連絡の対応を終える要求が同時に実行され、どちらも未対応の連絡を読んだ後に、B が先にコミットした / A の要求がコミットする", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { reportId } = await openReport(k);
    let afterB: Awaited<ReturnType<typeof k.storedReport>> | null = null;
    const racing = commitAfter(k.container, async () => {
      await k.resolveReport(opB, reportId);
      afterB = await k.storedReport(reportId);
    });
    await expectCode(k.resolveReport(opA, reportId, racing), ConflictError);
    expect(await k.storedReport(reportId)).toEqual(afterB);
  });

  it("resolveInfoReport#10 確認依頼中の連絡がある。操作する人は、対象の店舗の店舗管理者で、サービス運営者の役割を持たない / 対応を終える", async () => {
    const k = await moderationKit();
    const { m, reportId } = await openReport(k);
    await k.request(await k.operator(), reportId);
    await expectCode(k.resolveReport(m, reportId), ForbiddenError);
    expect((await k.storedReport(reportId)).entity.status).toBe(
      "confirmationRequested",
    );
  });
});
