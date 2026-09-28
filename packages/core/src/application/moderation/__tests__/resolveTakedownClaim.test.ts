import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { type ModerationKit, moderationKit } from "./kit";

async function openClaimOnListing(k: ModerationKit) {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const listing = await k.listingWithPhotos(m, placeId, 2);
  const target = { kind: "listing", id: listing.id } as const;
  const claimId = await k.claim({ target, photoIds: listing.photos });
  return { m, listing, target, claimId };
}

describe("resolveTakedownClaim", () => {
  it("resolveTakedownClaim#1 未対応の申立てがある。操作する人はサービス運営者 / 行った措置を結果に添えて対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { claimId } = await openClaimOnListing(k);
    const before = (await k.storedClaim(claimId)).entity;
    const mark = await k.mark();
    const view = await k.resolveClaim(op, claimId, "写真を2枚削除しました");
    const after = (await k.storedClaim(claimId)).entity;
    expect(after).toEqual({
      ...before,
      status: "resolved",
      outcome: "写真を2枚削除しました",
      version: before.version + 1,
    });
    expect(view).toMatchObject({
      claimId,
      status: "resolved",
      outcome: "写真を2枚削除しました",
    });
    expect(
      (await k.since(mark)).map((e) => ({ type: e.type, payload: e.payload })),
    ).toEqual([{ type: "takedown_claim.resolved", payload: { claimId } }]);
    expect((await k.openClaims(op)).count).toBe(0);
  });

  it("resolveTakedownClaim#2 未対応の申立てがあり、措置（写真の削除、非公開）を1つも行っていない / サービス運営者が、措置を行わないことを結果に添えて対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const claimId = await k.claim({
      target: { kind: "place", id: await k.place() },
    });
    await k.resolveClaim(op, claimId, "措置は行いません");
    expect((await k.storedClaim(claimId)).entity.status).toBe("resolved");
    expect(await k.events("takedown_claim.resolved")).toHaveLength(1);
  });

  it("resolveTakedownClaim#3 未対応の申立ての対象が、対応の前に削除されている / サービス運営者が、措置を行わないことを結果に添えて対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { m, listing, claimId } = await openClaimOnListing(k);
    await k.remove(m, listing.id);
    await k.resolveClaim(op, claimId, "対象はすでに削除されていました");
    expect((await k.storedClaim(claimId)).entity.status).toBe("resolved");
  });

  it("resolveTakedownClaim#4 未対応の申立てを読んだ後、takeDownPhotosByClaim で対象の写真を削除した / サービス運営者が対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { listing, target, claimId } = await openClaimOnListing(k);
    const read = await k.storedClaim(claimId);
    const [photo] = listing.photos;
    if (photo === undefined) throw new Error("photo");
    await k.takeDown(op, claimId, target, [photo]);
    expect(await k.storedClaim(claimId)).toEqual(read);
    await k.resolveClaim(op, claimId);
    expect((await k.storedClaim(claimId)).entity.status).toBe("resolved");
  });

  it("resolveTakedownClaim#5 未対応の申立てがある / サービス運営者が、結果を空にして対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { claimId } = await openClaimOnListing(k);
    const mark = await k.mark();
    await expectCode(
      k.resolveClaim(op, claimId, "  "),
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_OUTCOME",
    );
    expect((await k.storedClaim(claimId)).entity.status).toBe("open");
    expect(await k.since(mark)).toEqual([]);
  });

  it("resolveTakedownClaim#6 対応済みの申立てがある / サービス運営者が、結果を空にして対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { claimId } = await openClaimOnListing(k);
    await k.resolveClaim(op, claimId);
    await expectCode(
      k.resolveClaim(op, claimId, ""),
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
    );
  });

  it("resolveTakedownClaim#7 対応済みの申立てがある / サービス運営者が、別の結果を添えて対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { claimId } = await openClaimOnListing(k);
    await k.resolveClaim(op, claimId, "最初の結果");
    const before = await k.storedClaim(claimId);
    const mark = await k.mark();
    await expectCode(
      k.resolveClaim(op, claimId, "別の結果"),
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
    );
    expect(await k.storedClaim(claimId)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("resolveTakedownClaim#8 サービス運営者 A と B が、同じ未対応の申立てを読んだ。B が先に対応を終えた / A が、結果を添えて対応を終える", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { claimId } = await openClaimOnListing(k);
    await k.readClaim(opA, claimId);
    await k.readClaim(opB, claimId);
    await k.resolveClaim(opB, claimId, "B の結果");
    await expectCode(
      k.resolveClaim(opA, claimId, "A の結果"),
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
    );
    expect((await k.storedClaim(claimId)).entity).toMatchObject({
      status: "resolved",
      outcome: "B の結果",
    });
    expect(await k.events("takedown_claim.resolved")).toHaveLength(1);
  });

  it("resolveTakedownClaim#9 サービス運営者 A と B の、同じ未対応の申立ての対応を終える要求が同時に実行され、どちらも未対応の申立てを読んだ後に、B が先にコミットした / A の要求がコミットする", async () => {
    const k = await moderationKit();
    const [opA, opB] = [await k.operator(), await k.operator()];
    const { claimId } = await openClaimOnListing(k);
    const racing = commitAfter(k.container, () =>
      k.resolveClaim(opB, claimId, "B の結果"),
    );
    await expectCode(
      k.resolveClaim(opA, claimId, "A の結果", racing),
      ConflictError,
    );
    expect((await k.storedClaim(claimId)).entity).toMatchObject({
      status: "resolved",
      outcome: "B の結果",
    });
    expect(await k.events("takedown_claim.resolved")).toHaveLength(1);
  });

  it("resolveTakedownClaim#10 未対応の申立てがある。操作する人はサービス運営者の役割を持たない / 結果を添えて対応を終える", async () => {
    const k = await moderationKit();
    const { m, claimId } = await openClaimOnListing(k);
    const mark = await k.mark();
    await expectCode(k.resolveClaim(m, claimId), ForbiddenError);
    expect((await k.storedClaim(claimId)).entity.status).toBe("open");
    expect(await k.since(mark)).toEqual([]);
  });

  it("resolveTakedownClaim#11 サービス運営者が未対応の申立てを読んだ後、サービス運営者の役割を解除された / 対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    await k.operator();
    const { claimId } = await openClaimOnListing(k);
    const mark = await k.mark();
    const revoking = commitAfter(k.container, () =>
      k.revokeHolder("operator", op),
    );
    await expectCode(
      k.resolveClaim(op, claimId, "結果", revoking),
      ForbiddenError,
    );
    expect((await k.storedClaim(claimId)).entity.status).toBe("open");
    expect(
      (await k.since(mark)).filter((e) => e.type === "takedown_claim.resolved"),
    ).toEqual([]);
  });

  it("resolveTakedownClaim#12 未対応の申立ての対象の写真を、takeDownPhotosByClaim で削除した / サービス運営者が、結果を空にして対応を終える", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { listing, target, claimId } = await openClaimOnListing(k);
    const [photo, kept] = listing.photos;
    if (photo === undefined || kept === undefined) throw new Error("photos");
    await k.takeDown(op, claimId, target, [photo]);
    await expectCode(
      k.resolveClaim(op, claimId, ""),
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_OUTCOME",
    );
    expect((await k.storedClaim(claimId)).entity.status).toBe("open");
    expect(
      (await k.stored(listing.id)).entity.content.photos.items.map(
        (p) => p.photoId,
      ),
    ).toEqual([kept]);
  });
});
