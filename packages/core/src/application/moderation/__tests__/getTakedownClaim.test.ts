import { Article } from "@repo/core/domain/article/article";
import { TakedownClaimId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { updateListing } from "../../listing/updateListing";
import { suspendOccasion } from "../../occasion/suspendOccasion";
import { type ModerationKit, moderationKit } from "./kit";

async function claimedListing(k: ModerationKit, photos: number, name = "掲載") {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const listing = await k.listingWithPhotos(m, placeId, photos, name);
  const target = { kind: "listing", id: listing.id } as const;
  const [first] = listing.photos;
  if (first === undefined) throw new Error("photos");
  const claimId = await k.claim({ target, photoIds: [first] });
  return { placeId, m, listing, target, claimId };
}

describe("getTakedownClaim", () => {
  it("getTakedownClaim#1 写真の権利者が、閲覧できる掲載の写真3枚のうち1枚を示した、未対応の申立てがある。操作する人はサービス運営者 / 申立てを読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.listingWithPhotos(m, placeId, 3, "限定メニュー");
    const [p1, p2, p3] = listing.photos;
    if (p1 === undefined || p2 === undefined || p3 === undefined) {
      throw new Error("three photos");
    }
    const target = { kind: "listing", id: listing.id } as const;
    const receivedAt = k.clock.now();
    const claimId = await k.claim({
      target,
      photoIds: [p2],
      reason: "私が撮った写真です",
      email: "rights@example.com",
    });
    const detail = await k.readClaim(op, claimId);
    expect(detail).toEqual({
      claimId,
      standing: "photoRightsHolder",
      target,
      claimedPhotoIds: [p2],
      reason: "私が撮った写真です",
      email: "rights@example.com",
      receivedAt,
      status: "open",
      outcome: null,
      targetName: "限定メニュー",
      targetExists: true,
      targetViewable: true,
      photos: [p1, p2, p3].map((photoId) => ({
        photoId,
        displayRef: { url: expect.any(String) },
        claimed: photoId === p2,
      })),
      removedClaimedPhotoIds: [],
      targetPublication: null,
    });
  });

  it("getTakedownClaim#2 店舗本人が店舗を対象にした、未対応の申立てがある。店舗は写真を持つ / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const place = await k.placeWithPhotos(2, "一号店");
    const claimId = await k.claim({ target: { kind: "place", id: place.id } });
    const detail = await k.readClaim(await k.operator(), claimId);
    expect(detail.claimedPhotoIds).toEqual([]);
    expect(detail.photos.map((p) => [p.photoId, p.claimed])).toEqual(
      place.photos.map((photoId) => [photoId, false]),
    );
  });

  it("getTakedownClaim#3 未対応の申立ての対象の掲載が、運営による非公開になっている / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { listing, claimId } = await claimedListing(k, 2, "限定メニュー");
    await k.suspend(op, listing.id);
    const detail = await k.readClaim(op, claimId);
    expect(detail).toMatchObject({
      targetExists: true,
      targetViewable: false,
      targetName: "限定メニュー",
    });
    expect(detail.photos.map((p) => p.photoId)).toEqual(listing.photos);
  });

  it("getTakedownClaim#4 未対応の申立ての対象の掲載の店舗が、非公開になっている / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const { placeId, listing, claimId } = await claimedListing(k, 2);
    await k.suspendPlace(placeId);
    const detail = await k.readClaim(await k.operator(), claimId);
    expect(detail).toMatchObject({ targetExists: true, targetViewable: false });
    expect(detail.photos.map((p) => p.photoId)).toEqual(listing.photos);
  });

  it("getTakedownClaim#5 未対応の申立ての対象の掲載が、提出の後に削除されている / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const { m, listing, target, claimId } = await claimedListing(k, 2);
    await k.remove(m, listing.id);
    const detail = await k.readClaim(await k.operator(), claimId);
    expect(detail).toMatchObject({
      claimId,
      target,
      status: "open",
      targetExists: false,
      targetViewable: false,
      targetName: null,
      photos: [],
    });
  });

  it("getTakedownClaim#6 未対応の申立てで示された写真が、提出の後に対象から外されている。対象は残っている / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const { m, listing, claimId } = await claimedListing(k, 2);
    const [claimed, kept] = listing.photos;
    if (claimed === undefined || kept === undefined) throw new Error("photos");
    const stored = (await k.stored(listing.id)).entity;
    await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId: listing.id,
        version: stored.version,
        content: k.content({ name: "掲載", photos: [kept] }),
      },
    });
    const detail = await k.readClaim(await k.operator(), claimId);
    expect(detail.photos.map((p) => p.photoId)).toEqual([kept]);
    expect(detail.claimedPhotoIds).toEqual([claimed]);
    expect(detail.removedClaimedPhotoIds).toEqual([claimed]);
  });

  it("getTakedownClaim#7 対応済みの申立てがある / サービス運営者が申立てを読む", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const { claimId } = await claimedListing(k, 1);
    await k.resolveClaim(op, claimId, "措置は行いません");
    expect(await k.readClaim(op, claimId)).toMatchObject({
      status: "resolved",
      outcome: "措置は行いません",
    });
  });

  it("getTakedownClaim#8 サービス運営者。存在しない TakedownClaimId / 申立てを読む", async () => {
    const k = await moderationKit();
    await expectCode(
      k.readClaim(await k.operator(), TakedownClaimId.create(k.newId())),
      NotFoundError,
      "TAKEDOWN_CLAIM_NOT_FOUND",
    );
  });

  it("getTakedownClaim#9 未対応の申立てがある。操作する人はサービス運営者の役割を持たない / 申立てを読む", async () => {
    const k = await moderationKit();
    const { m, claimId } = await claimedListing(k, 1);
    await expectCode(k.readClaim(m, claimId), ForbiddenError);
  });

  it("reads a region claim after its only photo was taken down, and an occasion's while it is suspended", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const region = await k.regionWithPhotos(1);
    const [A] = region.photos;
    if (A === undefined) throw new Error("photo");
    const regionTarget = { kind: "region", id: region.id } as const;
    const regionClaim = await k.claim({ target: regionTarget, photoIds: [A] });
    await k.takeDown(op, regionClaim, regionTarget, [A]);
    expect(await k.readClaim(op, regionClaim)).toMatchObject({
      target: regionTarget,
      targetName: "谷中",
      targetExists: true,
      targetViewable: false,
      photos: [],
      removedClaimedPhotoIds: [A],
    });

    const occasion = await k.occasionWithPhotos(2);
    const [B, C] = occasion.photos;
    if (B === undefined || C === undefined) throw new Error("two photos");
    const occasionTarget = { kind: "occasion", id: occasion.id } as const;
    const occasionClaim = await k.claim({
      target: occasionTarget,
      photoIds: [C],
    });
    await suspendOccasion({
      container: k.container,
      actor: op.actor,
      input: { occasionId: occasion.id },
    });
    const detail = await k.readClaim(op, occasionClaim);
    expect(detail).toMatchObject({
      targetName: "秋のマルシェ",
      targetExists: true,
      targetViewable: false,
      removedClaimedPhotoIds: [],
    });
    expect(detail.photos.map((p) => [p.photoId, p.claimed])).toEqual([
      [B, false],
      [C, true],
    ]);
  });

  it("reads an article claim's publication state: published, then unpublished by the takedown of its last photo, or by an editor", async () => {
    const k = await moderationKit();
    const op = await k.operator();
    const article = await k.articleWithPhotos(2);
    const [A, B] = article.photos;
    if (A === undefined || B === undefined) throw new Error("two photos");
    const target = { kind: "article", id: article.id } as const;
    const claimId = await k.claim({ target, photoIds: [A, B] });
    expect(await k.readClaim(op, claimId)).toMatchObject({
      targetExists: true,
      targetViewable: true,
      targetPublication: { status: "published", reason: null },
    });

    await k.takeDown(op, claimId, target, [A]);
    expect((await k.readClaim(op, claimId)).targetPublication).toEqual({
      status: "published",
      reason: null,
    });

    await k.takeDown(op, claimId, target, [B]);
    expect(await k.readClaim(op, claimId)).toMatchObject({
      targetExists: true,
      targetViewable: false,
      photos: [],
      targetPublication: { status: "unpublished", reason: "photoTakedown" },
    });

    const withdrawn = await k.articleWithPhotos(1);
    const withdrawnTarget = { kind: "article", id: withdrawn.id } as const;
    const withdrawnClaim = await k.claim({
      target: withdrawnTarget,
      photoIds: withdrawn.photos,
    });
    await k.changeArticle(withdrawn.id, Article.unpublish);
    expect(await k.readClaim(op, withdrawnClaim)).toMatchObject({
      targetViewable: false,
      targetPublication: { status: "unpublished", reason: "byManager" },
    });
  });

  it("gives no publication state for a target other than an article", async () => {
    const k = await moderationKit();
    const region = await k.regionWithPhotos(1);
    const claimId = await k.claim({
      target: { kind: "region", id: region.id },
      photoIds: region.photos,
    });
    expect(
      (await k.readClaim(await k.operator(), claimId)).targetPublication,
    ).toBeNull();
  });
});
