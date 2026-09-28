import { InfoReportId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, UnauthorizedError } from "../../errors";
import { type ModerationKit, moderationKit, type ReportSpec } from "./kit";

/** Submits `spec` as `who` and asserts it fails, leaving no report and no event. */
async function expectRejected(
  k: ModerationKit,
  who: Person | null,
  spec: ReportSpec & Readonly<{ reportId: ReturnType<ModerationKit["newId"]> }>,
  errorClass: abstract new (...args: never[]) => Error,
  code?: string,
): Promise<void> {
  const mark = await k.mark();
  await expectCode(k.submitReport(who, spec), errorClass, code);
  const stored = await k.run(({ infoReportRepository }) =>
    infoReportRepository.findById(InfoReportId.create(spec.reportId)),
  );
  expect(stored).toBeNull();
  expect(await k.since(mark)).toEqual([]);
}

/** A viewable place with a steward, and a signed-in reporter. */
async function stewardedPlace(k: ModerationKit) {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const reporter = await k.person("reporter");
  return { placeId, m, reporter };
}

describe("submitInfoReport", () => {
  it("submitInfoReport#1 閲覧できる店舗に店舗管理者がいる。操作する人はログインした利用者 / 対象をその店舗、種類を情報の誤りにし、内容を添えて提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    const mark = await k.mark();
    const now = k.clock.now();
    const id = await k.report(reporter, {
      target: { kind: "place", placeId },
      category: "incorrectInfo",
      content: "営業時間が違います",
    });
    expect((await k.storedReport(id)).entity).toEqual({
      id,
      target: { kind: "place", placeId },
      category: "incorrectInfo",
      content: "営業時間が違います",
      reporter: reporter.accountId,
      receivedAt: now,
      version: 0,
      status: "open",
    });
    expect(
      (await k.since(mark)).map((e) => ({ type: e.type, payload: e.payload })),
    ).toEqual([{ type: "info_report.submitted", payload: { reportId: id } }]);
  });

  it("submitInfoReport#2 店舗管理者のいる閲覧できる店舗に、閲覧できる掲載がある / 対象をその掲載、種類を閉店にし、内容を添えて提出する", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const listing = await k.published(m, placeId);
    const id = await k.report(reporter, {
      target: { kind: "listing", listingId: listing.id },
      category: "closure",
    });
    const stored = (await k.storedReport(id)).entity;
    expect(stored.target).toEqual({
      kind: "listing",
      placeId,
      listingId: listing.id,
    });
    expect(stored.category).toBe("closure");
    expect(await k.events("info_report.submitted")).toHaveLength(1);
  });

  it("submitInfoReport#3 閲覧できる店舗に店舗管理者がいない / その店舗を対象に提出する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    await expectRejected(
      k,
      await k.person(),
      { reportId: k.newId(), target: { kind: "place", placeId } },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
    );
  });

  it("submitInfoReport#4 管理者のいない店舗に、閲覧できる掲載がある / その掲載を対象に提出する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const listing = await k.published(await k.operator(), placeId);
    await expectRejected(
      k,
      await k.person(),
      {
        reportId: k.newId(),
        target: { kind: "listing", listingId: listing.id },
      },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD",
    );
  });

  it("submitInfoReport#5 店舗管理者のいる店舗が、入力している間に非公開になった / その店舗を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    await k.suspendPlace(placeId);
    await expectRejected(
      k,
      reporter,
      { reportId: k.newId(), target: { kind: "place", placeId } },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
  });

  it("submitInfoReport#6 店舗管理者のいる店舗の掲載が、入力している間に一時非公開になった / その掲載を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const listing = await k.published(m, placeId);
    await k.unpublish(m, listing.id);
    await expectRejected(
      k,
      reporter,
      {
        reportId: k.newId(),
        target: { kind: "listing", listingId: listing.id },
      },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
  });

  it("submitInfoReport#7 店舗管理者のいる店舗の公開中の掲載がある。店舗が、入力している間に非公開になった / その掲載を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const listing = await k.published(m, placeId);
    await k.suspendPlace(placeId);
    await expectRejected(
      k,
      reporter,
      {
        reportId: k.newId(),
        target: { kind: "listing", listingId: listing.id },
      },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
  });

  it("submitInfoReport#8 店舗管理者のいる店舗の掲載が、入力している間に削除された / その掲載を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const listing = await k.published(m, placeId);
    await k.remove(m, listing.id);
    await expectRejected(
      k,
      reporter,
      {
        reportId: k.newId(),
        target: { kind: "listing", listingId: listing.id },
      },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
  });

  it("submitInfoReport#9 管理者のいない店舗が、入力している間に非公開になった / その店舗を対象に提出する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    await k.suspendPlace(placeId);
    await expectRejected(
      k,
      await k.person(),
      { reportId: k.newId(), target: { kind: "place", placeId } },
      BusinessRuleError,
      "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE",
    );
  });

  it("submitInfoReport#10 掲載を対象にした連絡を提出した後、その掲載が削除された / 同じ利用者が、同じ ID・同じ対象・種類・内容で、もう一度提出する", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const listing = await k.published(m, placeId);
    const spec = {
      reportId: k.newId(),
      target: { kind: "listing", listingId: listing.id },
    } as const;
    await k.submitReport(reporter, spec);
    await k.remove(m, listing.id);
    const id = InfoReportId.create(spec.reportId);
    const before = await k.storedReport(id);
    const mark = await k.mark();
    await k.submitReport(reporter, spec);
    expect(await k.storedReport(id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
    expect(await k.events("info_report.submitted")).toHaveLength(1);
  });

  it("submitInfoReport#11 店舗管理者のいる閲覧できる店舗がある / 内容を空にして提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    await expectRejected(
      k,
      reporter,
      {
        reportId: k.newId(),
        target: { kind: "place", placeId },
        content: " ",
      },
      BusinessRuleError,
      "MODERATION_INVALID_INFO_REPORT_CONTENT",
    );
  });

  it("submitInfoReport#12 店舗管理者のいる店舗が、入力している間に非公開になった / 内容を空にして提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    await k.suspendPlace(placeId);
    await expectRejected(
      k,
      reporter,
      { reportId: k.newId(), target: { kind: "place", placeId }, content: "" },
      BusinessRuleError,
      "MODERATION_INVALID_INFO_REPORT_CONTENT",
    );
  });

  it("submitInfoReport#13 店舗管理者のいる閲覧できる店舗がある / 2つの値のどちらでもない種類で提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    await expectRejected(
      k,
      reporter,
      {
        reportId: k.newId(),
        target: { kind: "place", placeId },
        category: "spam",
      },
      BusinessRuleError,
      "MODERATION_INVALID_INFO_REPORT_CATEGORY",
    );
  });

  it("submitInfoReport#14 連絡を提出して、未対応の連絡が保存されている / 同じ利用者が、同じ ID・同じ対象・種類・内容で、もう一度提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    const spec = {
      reportId: k.newId(),
      target: { kind: "place", placeId },
    } as const;
    await k.submitReport(reporter, spec);
    const id = InfoReportId.create(spec.reportId);
    const before = await k.storedReport(id);
    const mark = await k.mark();
    k.tick();
    await k.submitReport(reporter, spec);
    expect(await k.storedReport(id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
    expect((await k.unresolved(await k.operator())).count).toBe(1);
  });

  it("submitInfoReport#15 連絡を提出して、未対応の連絡が保存されている / 同じ利用者が、同じ ID で、内容だけを変えて提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    const spec = {
      reportId: k.newId(),
      target: { kind: "place", placeId },
    } as const;
    await k.submitReport(reporter, spec);
    const id = InfoReportId.create(spec.reportId);
    const before = await k.storedReport(id);
    const mark = await k.mark();
    await expectCode(
      k.submitReport(reporter, { ...spec, content: "別の内容" }),
      ConflictError,
    );
    expect(await k.storedReport(id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("submitInfoReport#16 利用者が、ある店舗についての連絡を1件提出している / 同じ利用者が、同じ店舗を対象に、別の ID で連絡を提出する", async () => {
    const k = await moderationKit();
    const { placeId, reporter } = await stewardedPlace(k);
    const target = { kind: "place", placeId } as const;
    const first = await k.report(reporter, { target });
    const second = await k.report(reporter, { target });
    for (const id of [first, second]) {
      expect((await k.storedReport(id)).entity.status).toBe("open");
    }
    expect(
      (await k.events("info_report.submitted")).map((e) => e.payload),
    ).toEqual([{ reportId: first }, { reportId: second }]);
  });

  it("submitInfoReport#17 店舗管理者のいる店舗についての未対応の連絡がある / その店舗のすべての店舗管理者が辞任した後、連絡を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter } = await stewardedPlace(k);
    const id = await k.report(reporter, { target: { kind: "place", placeId } });
    await k.resign(placeId, m);
    expect((await k.storedReport(id)).entity.status).toBe("open");
  });

  it("submitInfoReport#18 店舗管理者のいる閲覧できる店舗がある。操作する人はログインしていない / その店舗を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId } = await stewardedPlace(k);
    await expectRejected(
      k,
      null,
      { reportId: k.newId(), target: { kind: "place", placeId } },
      UnauthorizedError,
      "LOGIN_REQUIRED",
    );
  });
});
