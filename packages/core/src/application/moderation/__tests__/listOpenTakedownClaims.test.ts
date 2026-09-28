import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { moderationKit } from "./kit";

describe("listOpenTakedownClaims", () => {
  it("listOpenTakedownClaims#1 未対応の申立てが3件あり、受け付けた日時が互いに違う。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const placeId = await k.place("二号店");
    const m = await k.manager(placeId);
    const listing = await k.listingWithPhotos(m, placeId, 1, "限定メニュー");
    const times: Date[] = [];
    const claim = async (spec: Parameters<typeof k.claim>[0]) => {
      times.push(k.tick());
      return k.claim(spec);
    };
    const c1 = await claim({
      target: { kind: "place", id: placeId },
      email: "a@example.com",
    });
    const c2 = await claim({
      target: { kind: "listing", id: listing.id },
      photoIds: listing.photos,
      email: "b@example.com",
    });
    const c3 = await claim({
      target: { kind: "listing", id: listing.id },
      email: "c@example.com",
    });
    const result = await k.openClaims(op);
    expect(result.count).toBe(3);
    expect(result.items).toEqual([
      {
        claimId: c1,
        standing: "proprietor",
        target: { kind: "place", id: placeId },
        targetName: "二号店",
        email: "a@example.com",
        receivedAt: times[0],
      },
      {
        claimId: c2,
        standing: "photoRightsHolder",
        target: { kind: "listing", id: listing.id },
        targetName: "限定メニュー",
        email: "b@example.com",
        receivedAt: times[1],
      },
      {
        claimId: c3,
        standing: "proprietor",
        target: { kind: "listing", id: listing.id },
        targetName: "限定メニュー",
        email: "c@example.com",
        receivedAt: times[2],
      },
    ]);
  });

  it("listOpenTakedownClaims#2 未対応の申立てが2件、対応済みの申立てが1件ある。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const target = { kind: "place", id: await k.place() } as const;
    const open1 = await k.claim({ target });
    const resolved = await k.claim({ target });
    const open2 = await k.claim({ target });
    await k.resolveClaim(op, resolved);
    const result = await k.openClaims(op);
    expect(result.items.map((c) => c.claimId)).toEqual([open1, open2]);
    expect(result.count).toBe(2);
  });

  it("listOpenTakedownClaims#3 未対応の申立てがあり、その対象の掲載は提出の後に削除されている / サービス運営者が一覧を読む", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.listingWithPhotos(m, placeId, 1);
    const target = { kind: "listing", id: listing.id } as const;
    const claimId = await k.claim({ target });
    await k.remove(m, listing.id);
    const result = await k.openClaims(await k.operator());
    expect(result.items).toEqual([
      expect.objectContaining({ claimId, target, targetName: null }),
    ]);
  });

  it("listOpenTakedownClaims#4 未対応の申立てがあり、その対象の掲載は提出の後に運営による非公開になっている / サービス運営者が一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.listingWithPhotos(m, placeId, 1, "限定メニュー");
    const claimId = await k.claim({
      target: { kind: "listing", id: listing.id },
    });
    await k.suspend(op, listing.id);
    expect((await k.openClaims(op)).items).toEqual([
      expect.objectContaining({ claimId, targetName: "限定メニュー" }),
    ]);
  });

  it("listOpenTakedownClaims#5 申立てが1件もない。操作する人はサービス運営者 / 一覧を読む", async () => {
    const k = await moderationKit();
    expect(await k.openClaims(await k.operator())).toEqual({
      items: [],
      count: 0,
    });
  });

  it("listOpenTakedownClaims#6 未対応の申立てが1件ある / サービス運営者が resolveTakedownClaim で対応を終えた後、一覧を読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const claimId = await k.claim({
      target: { kind: "place", id: await k.place() },
    });
    await k.resolveClaim(op, claimId);
    expect(await k.openClaims(op)).toEqual({ items: [], count: 0 });
  });

  it("listOpenTakedownClaims#7 未対応の申立てがある。操作する人はサービス運営者の役割を持たない / 一覧を読む", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    await k.claim({ target: { kind: "place", id: placeId } });
    await expectCode(k.openClaims(m), ForbiddenError);
  });
});
