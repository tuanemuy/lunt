import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
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

const requestedEvents = (k: ModerationKit) =>
  k.events("info_report.confirmation_requested");

describe("requestInfoReportConfirmation", () => {
  it("requestInfoReportConfirmation#1 店舗管理者が2人いる店舗についての、未対応の連絡がある。操作する人はサービス運営者 / 確認を依頼する", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const placeId = await k.place();
    const [m1, m2] = [await k.manager(placeId), await k.manager(placeId)];
    const reportId = await k.report(await k.person(), {
      target: { kind: "place", placeId },
    });
    const before = (await k.storedReport(reportId)).entity;
    const now = k.tick();
    const mark = await k.mark();
    const view = await k.request(op, reportId);
    const after = (await k.storedReport(reportId)).entity;
    expect(after).toEqual({
      ...before,
      status: "confirmationRequested",
      request: { requestedAt: now },
      version: before.version + 1,
    });
    expect(view).toMatchObject({
      reportId,
      status: "confirmationRequested",
      requestedAt: now,
    });
    expect(
      (await k.since(mark)).map((e) => ({ type: e.type, payload: e.payload })),
    ).toEqual([
      {
        type: "info_report.confirmation_requested",
        payload: { reportId, target: { kind: "place", placeId } },
      },
    ]);
    for (const m of [m1, m2]) {
      expect((await k.requestsFor(m, placeId)).items).toEqual([
        expect.objectContaining({ reportId }),
      ]);
    }
    expect((await k.unresolved(op)).items).toEqual([
      expect.objectContaining({ reportId, status: "confirmationRequested" }),
    ]);
  });

  it("requestInfoReportConfirmation#2 店舗管理者のいる店舗の掲載を対象にした、未対応の連絡がある / サービス運営者が確認を依頼する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.published(m, placeId);
    const reportId = await k.report(await k.person(), {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.request(await k.operator(), reportId);
    expect((await requestedEvents(k)).map((e) => e.payload)).toEqual([
      {
        reportId,
        target: { kind: "listing", placeId, listingId: listing.id },
      },
    ]);
  });

  it("requestInfoReportConfirmation#3 未対応の連絡の対象の店舗が、非公開になっている。店舗管理者はいる / サービス運営者が確認を依頼する", async () => {
    const k = await moderationKit();
    const { placeId, reportId } = await openReport(k);
    await k.suspendPlace(placeId);
    await k.request(await k.operator(), reportId);
    expect((await k.storedReport(reportId)).entity.status).toBe(
      "confirmationRequested",
    );
  });

  it("requestInfoReportConfirmation#4 未対応の連絡の対象の店舗で、連絡の後にすべての店舗管理者が辞任・退会した / サービス運営者が確認を依頼する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const [m1, m2] = [await k.manager(placeId), await k.manager(placeId)];
    const reportId = await k.report(await k.person(), {
      target: { kind: "place", placeId },
    });
    await k.resign(placeId, m1);
    await k.withdraw(m2);
    await expectCode(
      k.request(await k.operator(), reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
    );
    expect((await k.storedReport(reportId)).entity.status).toBe("open");
    expect(await requestedEvents(k)).toEqual([]);
  });

  it("requestInfoReportConfirmation#5 確認依頼中の連絡がある / サービス運営者が、もう一度確認を依頼する", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { reportId } = await openReport(k);
    await k.request(op, reportId);
    const before = await k.storedReport(reportId);
    k.tick();
    await expectCode(
      k.request(op, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_NOT_OPEN",
    );
    expect(await k.storedReport(reportId)).toEqual(before);
    expect(await requestedEvents(k)).toHaveLength(1);
  });

  it("requestInfoReportConfirmation#6 対応済みの連絡がある / サービス運営者が確認を依頼する", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { reportId } = await openReport(k);
    await k.resolveReport(op, reportId);
    await expectCode(
      k.request(op, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_NOT_OPEN",
    );
    expect((await k.storedReport(reportId)).entity.status).toBe("resolved");
    expect(await requestedEvents(k)).toEqual([]);
  });

  it("requestInfoReportConfirmation#7 サービス運営者 A と B が、同じ未対応の連絡を読んだ。B が先に確認を依頼した / A が確認を依頼する", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { reportId } = await openReport(k);
    await k.readReport(opA, reportId);
    await k.readReport(opB, reportId);
    await k.request(opB, reportId);
    const afterB = await k.storedReport(reportId);
    k.tick();
    await expectCode(
      k.request(opA, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_NOT_OPEN",
    );
    expect(await k.storedReport(reportId)).toEqual(afterB);
    expect(await requestedEvents(k)).toHaveLength(1);
  });

  it("requestInfoReportConfirmation#8 サービス運営者 A と B の、同じ未対応の連絡への確認の依頼が同時に実行され、どちらも未対応の連絡を読んだ後に、B が先にコミットした / A の要求がコミットする", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { reportId } = await openReport(k);
    let afterB: Awaited<ReturnType<typeof k.storedReport>> | null = null;
    const racing = commitAfter(k.container, async () => {
      await k.request(opB, reportId);
      afterB = await k.storedReport(reportId);
    });
    await expectCode(k.request(opA, reportId, racing), ConflictError);
    expect(await k.storedReport(reportId)).toEqual(afterB);
    expect(await requestedEvents(k)).toHaveLength(1);
  });

  it("requestInfoReportConfirmation#9 確認依頼中の連絡の対象の店舗で、すべての店舗管理者が辞任した / サービス運営者が確認を依頼する", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId, m, reportId } = await openReport(k);
    await k.request(op, reportId);
    await k.resign(placeId, m);
    await expectCode(
      k.request(op, reportId),
      BusinessRuleError,
      "MODERATION_INFO_REPORT_NOT_OPEN",
    );
  });

  it("requestInfoReportConfirmation#10 未対応の連絡がある。操作する人は、対象の店舗の店舗管理者で、サービス運営者の役割を持たない / 確認を依頼する", async () => {
    const k = await moderationKit();
    const { m, reportId } = await openReport(k);
    await expectCode(k.request(m, reportId), ForbiddenError);
    expect((await k.storedReport(reportId)).entity.status).toBe("open");
    expect(await requestedEvents(k)).toEqual([]);
  });
});
