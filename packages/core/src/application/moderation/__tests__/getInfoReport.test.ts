import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { type ModerationKit, moderationKit } from "./kit";

/** A place with one steward, a reporter and an operator. */
async function setup(k: ModerationKit) {
  const placeId = await k.place("一号店");
  const m = await k.manager(placeId);
  const reporter = await k.person("reporter");
  const op = await k.operator();
  return { placeId, m, reporter, op };
}

describe("getInfoReport", () => {
  it("getInfoReport#1 店舗管理者のいる店舗についての、未対応の連絡がある。操作する人はサービス運営者 / 連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const receivedAt = k.clock.now();
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
      content: "営業時間が違います",
    });
    expect(await k.readReport(op, reportId)).toEqual({
      reportId,
      target: {
        target: { kind: "place", placeId },
        placeName: "一号店",
        listingName: null,
        exists: true,
      },
      category: "incorrectInfo",
      content: "営業時間が違います",
      reporter: reporter.accountId,
      reporterEmail: reporter.email,
      receivedAt,
      status: "open",
      requestedAt: null,
      targetViewable: true,
      placeHasSteward: true,
    });
  });

  it("getInfoReport#2 未対応の連絡の対象の店舗で、連絡の後にすべての店舗管理者が辞任・退会した / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const m2 = await k.manager(placeId);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.resign(placeId, m);
    await k.withdraw(m2);
    expect(await k.readReport(op, reportId)).toMatchObject({
      reportId,
      status: "open",
      placeHasSteward: false,
    });
  });

  it("getInfoReport#3 掲載を対象にした未対応の連絡があり、その掲載は提出の後に削除されている / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const listing = await k.published(m, placeId, { name: "限定メニュー" });
    const reportId = await k.report(reporter, {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.remove(m, listing.id);
    expect(await k.readReport(op, reportId)).toMatchObject({
      target: {
        target: { kind: "listing", placeId, listingId: listing.id },
        placeName: "一号店",
        listingName: null,
        exists: false,
      },
      targetViewable: false,
      placeHasSteward: true,
    });
  });

  it("getInfoReport#4 未対応の連絡の対象の店舗が、連絡の後に非公開になっている / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.suspendPlace(placeId);
    expect(await k.readReport(op, reportId)).toMatchObject({
      target: { placeName: "一号店", exists: true },
      targetViewable: false,
    });
  });

  it("getInfoReport#5 未対応の連絡があり、連絡した人は提出の後に退会している / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.deleteAccount(reporter);
    expect(await k.readReport(op, reportId)).toMatchObject({
      reporter: reporter.accountId,
      reporterEmail: null,
    });
  });

  it("getInfoReport#6 確認依頼中の連絡がある / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    const requestedAt = k.tick();
    await k.request(op, reportId);
    expect(await k.readReport(op, reportId)).toMatchObject({
      status: "confirmationRequested",
      requestedAt,
    });
  });

  it("getInfoReport#7 依頼を経て対応済みになった連絡がある / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    const requestedAt = k.tick();
    await k.request(op, reportId);
    await k.resolveReport(op, reportId);
    expect(await k.readReport(op, reportId)).toMatchObject({
      status: "resolved",
      requestedAt,
    });
  });

  it("getInfoReport#8 依頼せずに対応済みになった連絡がある / サービス運営者が連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.resolveReport(op, reportId);
    expect(await k.readReport(op, reportId)).toMatchObject({
      status: "resolved",
      requestedAt: null,
    });
  });

  it("getInfoReport#9 未対応の連絡がある。操作する人はサービス運営者の役割を持たない / 連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await expectCode(k.readReport(m, reportId), ForbiddenError);
  });
});
