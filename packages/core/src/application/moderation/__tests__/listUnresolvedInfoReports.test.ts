import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { type ModerationKit, moderationKit } from "./kit";

async function stewardedPlace(k: ModerationKit, name = "店舗") {
  const placeId = await k.place(name);
  const m = await k.manager(placeId);
  return { placeId, m };
}

describe("listUnresolvedInfoReports", () => {
  it("listUnresolvedInfoReports#1 未対応の連絡が2件、確認依頼中の連絡が1件あり、受け付けた日時が互いに違う。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId, m } = await stewardedPlace(k, "一号店");
    const listing = await k.published(m, placeId, { name: "限定メニュー" });
    const reporter = await k.person("reporter");
    const times: Date[] = [];
    const report = async (spec: Parameters<typeof k.report>[1]) => {
      times.push(k.tick());
      return k.report(reporter, spec);
    };
    const r1 = await report({
      target: { kind: "listing", listingId: listing.id },
      category: "closure",
    });
    const r2 = await report({ target: { kind: "place", placeId } });
    const r3 = await report({ target: { kind: "place", placeId } });
    await k.request(op, r1);
    const result = await k.unresolved(op);
    expect(result.count).toBe(3);
    expect(result.items).toEqual([
      {
        reportId: r1,
        target: {
          target: { kind: "listing", placeId, listingId: listing.id },
          placeName: "一号店",
          listingName: "限定メニュー",
          exists: true,
        },
        category: "closure",
        status: "confirmationRequested",
        reporter: reporter.accountId,
        reporterEmail: reporter.email,
        receivedAt: times[0],
      },
      {
        reportId: r2,
        target: {
          target: { kind: "place", placeId },
          placeName: "一号店",
          listingName: null,
          exists: true,
        },
        category: "incorrectInfo",
        status: "open",
        reporter: reporter.accountId,
        reporterEmail: reporter.email,
        receivedAt: times[1],
      },
      expect.objectContaining({ reportId: r3, receivedAt: times[2] }),
    ]);
  });

  it("listUnresolvedInfoReports#2 未対応の連絡が1件、対応済みの連絡が1件ある。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId } = await stewardedPlace(k);
    const reporter = await k.person();
    const open = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    const resolved = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.resolveReport(op, resolved);
    const result = await k.unresolved(op);
    expect(result.items.map((r) => r.reportId)).toEqual([open]);
    expect(result.count).toBe(1);
  });

  it("listUnresolvedInfoReports#3 未対応の連絡があり、連絡した人は提出の後に退会している / サービス運営者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId } = await stewardedPlace(k);
    const reporter = await k.person();
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.deleteAccount(reporter);
    expect((await k.unresolved(await k.operator())).items).toEqual([
      expect.objectContaining({
        reportId,
        reporter: reporter.accountId,
        reporterEmail: null,
      }),
    ]);
  });

  it("listUnresolvedInfoReports#4 未対応の連絡があり、対象の掲載は提出の後に削除されている / サービス運営者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m } = await stewardedPlace(k, "一号店");
    const listing = await k.published(m, placeId);
    const reportId = await k.report(await k.person(), {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.remove(m, listing.id);
    expect((await k.unresolved(await k.operator())).items).toEqual([
      expect.objectContaining({
        reportId,
        target: {
          target: { kind: "listing", placeId, listingId: listing.id },
          placeName: "一号店",
          listingName: null,
          exists: false,
        },
      }),
    ]);
  });

  it("listUnresolvedInfoReports#5 連絡が1件もない。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    expect(await k.unresolved(await k.operator())).toEqual({
      items: [],
      count: 0,
    });
  });

  it("listUnresolvedInfoReports#6 確認依頼中の連絡が1件ある / サービス運営者が resolveInfoReport で対応を終えた後、一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { placeId } = await stewardedPlace(k);
    const reportId = await k.report(await k.person(), {
      target: { kind: "place", placeId },
    });
    await k.request(op, reportId);
    await k.resolveReport(op, reportId);
    expect(await k.unresolved(op)).toEqual({ items: [], count: 0 });
  });

  it("listUnresolvedInfoReports#7 未対応の連絡がある。操作する人はサービス運営者の役割を持たない（連絡の対象の店舗の店舗管理者） / 一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m } = await stewardedPlace(k);
    await k.report(await k.person(), { target: { kind: "place", placeId } });
    await expectCode(k.unresolved(m), ForbiddenError);
  });
});
