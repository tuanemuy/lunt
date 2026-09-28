import { InfoReportId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { type ModerationKit, moderationKit } from "./kit";

/** A place with one steward, a reporter and an operator. */
async function setup(k: ModerationKit) {
  const placeId = await k.place("一号店");
  const m = await k.manager(placeId);
  const reporter = await k.person("reporter");
  const op = await k.operator();
  return { placeId, m, reporter, op };
}

/** A confirmation-requested report about the place; returns its id and request time. */
async function requestedAboutPlace(
  k: ModerationKit,
  s: Awaited<ReturnType<typeof setup>>,
) {
  const reportId = await k.report(s.reporter, {
    target: { kind: "place", placeId: s.placeId },
    category: "closure",
    content: "閉店しました",
  });
  const requestedAt = k.tick();
  await k.request(s.op, reportId);
  return { reportId, requestedAt };
}

describe("getConfirmationRequest", () => {
  it("getConfirmationRequest#1 店舗 P を対象にした確認依頼中の連絡がある。操作する人は P の店舗管理者 / 依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const { reportId, requestedAt } = await requestedAboutPlace(k, s);
    expect(await k.readRequest(s.m, reportId)).toEqual({
      reportId,
      target: {
        target: { kind: "place", placeId: s.placeId },
        placeName: "一号店",
        listingName: null,
        exists: true,
      },
      category: "closure",
      content: "閉店しました",
      requestedAt,
      status: "confirmationRequested",
    });
  });

  it("getConfirmationRequest#2 店舗 P の掲載を対象にした確認依頼中の連絡がある / P の店舗管理者が依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const listing = await k.published(s.m, s.placeId, {
      name: "限定メニュー",
    });
    const reportId = await k.report(s.reporter, {
      target: { kind: "listing", listingId: listing.id },
      content: "価格が違います",
    });
    const requestedAt = k.tick();
    await k.request(s.op, reportId);
    expect(await k.readRequest(s.m, reportId)).toEqual({
      reportId,
      target: {
        target: { kind: "listing", placeId: s.placeId, listingId: listing.id },
        placeName: "一号店",
        listingName: "限定メニュー",
        exists: true,
      },
      category: "incorrectInfo",
      content: "価格が違います",
      requestedAt,
      status: "confirmationRequested",
    });
  });

  it("getConfirmationRequest#3 店舗 P の掲載を対象にした確認依頼中の連絡があり、その掲載は削除されている / P の店舗管理者が依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const listing = await k.published(s.m, s.placeId);
    const reportId = await k.report(s.reporter, {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.request(s.op, reportId);
    await k.remove(s.m, listing.id);
    expect(await k.readRequest(s.m, reportId)).toMatchObject({
      reportId,
      target: {
        target: { kind: "listing", placeId: s.placeId, listingId: listing.id },
        listingName: null,
        exists: false,
      },
      content: "営業時間が違います",
    });
  });

  it("getConfirmationRequest#4 依頼を経て、サービス運営者が対応を終えた連絡がある / P の店舗管理者が依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const { reportId, requestedAt } = await requestedAboutPlace(k, s);
    await k.resolveReport(s.op, reportId);
    expect(await k.readRequest(s.m, reportId)).toMatchObject({
      content: "閉店しました",
      requestedAt,
      status: "resolved",
    });
  });

  it("getConfirmationRequest#5 店舗 P に店舗管理者が2人いて、確認依頼中の連絡がある / 2人がそれぞれ依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const m2 = await k.manager(s.placeId);
    const { reportId } = await requestedAboutPlace(k, s);
    expect(await k.readRequest(m2, reportId)).toEqual(
      await k.readRequest(s.m, reportId),
    );
  });

  it("getConfirmationRequest#6 店舗 P についての未対応の連絡がある（依頼を持たない） / P の店舗管理者が、その連絡の ID で依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const reportId = await k.report(s.reporter, {
      target: { kind: "place", placeId: s.placeId },
    });
    await expectCode(
      k.readRequest(s.m, reportId),
      NotFoundError,
      "INFO_REPORT_NOT_FOUND",
    );
  });

  it("getConfirmationRequest#7 店舗 P についての、依頼せずに対応済みになった連絡がある / P の店舗管理者が、その連絡の ID で依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const reportId = await k.report(s.reporter, {
      target: { kind: "place", placeId: s.placeId },
    });
    await k.resolveReport(s.op, reportId);
    await expectCode(
      k.readRequest(s.m, reportId),
      NotFoundError,
      "INFO_REPORT_NOT_FOUND",
    );
  });

  it("getConfirmationRequest#8 店舗 P を対象にした確認依頼中の連絡がある。操作する人は、依頼を受けた後に P の店舗管理者を辞任した / 依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    await k.manager(s.placeId);
    const { reportId } = await requestedAboutPlace(k, s);
    await k.resign(s.placeId, s.m);
    await expectCode(k.readRequest(s.m, reportId), ForbiddenError);
  });

  it("getConfirmationRequest#9 店舗 P を対象にした確認依頼中の連絡がある。操作する人は店舗 Q だけの店舗管理者 / 依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const other = await k.manager(await k.place("二号店"));
    const { reportId } = await requestedAboutPlace(k, s);
    await expectCode(k.readRequest(other, reportId), ForbiddenError);
  });

  it("getConfirmationRequest#10 店舗 P を対象にした確認依頼中の連絡がある。P のすべての店舗管理者が辞任し、店舗管理者がいない / サービス運営者が依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const { reportId } = await requestedAboutPlace(k, s);
    await k.resign(s.placeId, s.m);
    await expectCode(k.readRequest(s.op, reportId), ForbiddenError);
  });

  it("getConfirmationRequest#11 店舗 P についての未対応の連絡がある（依頼を持たない）。操作する人は店舗 Q だけの店舗管理者 / その連絡の ID で依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    const other = await k.manager(await k.place("二号店"));
    const reportId = await k.report(s.reporter, {
      target: { kind: "place", placeId: s.placeId },
    });
    await expectCode(k.readRequest(other, reportId), ForbiddenError);
  });

  it("getConfirmationRequest#12 P の店舗管理者。存在しない InfoReportId / 依頼を読む", async () => {
    const k = await moderationKit();
    const s = await setup(k);
    await expectCode(
      k.readRequest(s.m, InfoReportId.create(k.newId())),
      NotFoundError,
      "INFO_REPORT_NOT_FOUND",
    );
  });
});
