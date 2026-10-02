import { expectBusinessRuleError } from "@repo/core/adapters/durableObject/__conformance__/assertions";
import { Article } from "@repo/core/domain/article/article";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import { EventId } from "@repo/core/domain/common/event";
import {
  ArticleId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { eventDecoders } from "../../events/registry";
import { updateListing } from "../../listing/updateListing";
import { discardReleasedPhotos } from "../../media/discardReleasedPhotos";
import { fieldsOf } from "../../occasion/__tests__/kit";
import { suspendOccasion } from "../../occasion/suspendOccasion";
import { updateOccasionContent } from "../../occasion/updateOccasionContent";
import { type ModerationKit, moderationKit } from "./kit";

const two = <T>(items: readonly T[]): readonly [T, T] => {
  const [a, b] = items;
  if (a === undefined || b === undefined) throw new Error("two items");
  return [a, b];
};

const three = <T>(items: readonly T[]): readonly [T, T, T] => {
  const [a, b, c] = items;
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error("three items");
  }
  return [a, b, c];
};

const photoIdsOf = (photos: PhotoSet<Readonly<{ photoId: PhotoId }>>) =>
  PhotoSet.photoIds(photos);

/** A published listing with `photos` registered photos and its manager. */
async function publishedListing(k: ModerationKit, photos: number) {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const listing = await k.listingWithPhotos(m, placeId, photos);
  const target = { kind: "listing", id: listing.id } as const;
  return { placeId, m, listing, target };
}

/** Events stored since `mark`, as `{ type, payload }`. */
async function eventsSince(k: ModerationKit, mark: number) {
  return (await k.since(mark)).map((e) => ({
    type: e.type,
    payload: e.payload,
  }));
}

/**
 * Stores an open photo-rights claim on `target` straight through the
 * repository, for targets `submitTakedownClaim` refuses as not viewable
 * (a draft, an unstored target).
 */
async function storeClaim(
  k: ModerationKit,
  target: ContentRef,
  photoIds: readonly [PhotoId, ...PhotoId[]],
): Promise<TakedownClaimId> {
  const { entity } = TakedownClaim.submit(
    {
      id: TakedownClaimId.create(k.newId()),
      standing: "photoRightsHolder",
      target,
      photoIds,
      reason: "私が撮った写真です",
      email: "rights@example.com",
    },
    { viewable: true, photoIds },
    k.clock.now(),
  );
  await k.run(({ takedownClaimRepository }) =>
    takedownClaimRepository.insert(entity),
  );
  return entity.id;
}

/** Replaces the listing's photos through `updateListing` (its manager's save). */
async function keepOnly(
  k: ModerationKit,
  who: Awaited<ReturnType<ModerationKit["manager"]>>,
  listingId: Parameters<ModerationKit["stored"]>[0],
  photos: readonly PhotoId[],
) {
  const stored = (await k.stored(listingId)).entity;
  await updateListing({
    container: k.container,
    actor: who.actor,
    input: {
      listingId,
      version: stored.version,
      content: k.content({ name: "掲載", photos }),
    },
  });
}

describe("takeDownPhotosByClaim", () => {
  describe("申立て", () => {
    it("takeDownPhotosByClaim#1 写真 A・B を持つ公開中の掲載 L。写真の権利者が L の写真 A を示した未対応の申立て / 申立てに基づいて、L の写真 A を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const { listing, target } = await publishedListing(k, 2);
      const [A, B] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      const claimBefore = await k.storedClaim(claimId);
      const mark = await k.mark();
      const output = await k.takeDown(op, claimId, target, [A]);
      expect(output).toEqual({ publication: "published", unpublished: false });
      const stored = (await k.stored(listing.id)).entity;
      expect(photoIdsOf(stored.content.photos)).toEqual([B]);
      expect(stored.content.photos.takenDown).toBe(true);
      expect(stored.publication.status).toBe("published");
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
      expect(await k.storedClaim(claimId)).toEqual(claimBefore);
    });

    it("takeDownPhotosByClaim#2 上の削除の後 / discardReleasedPhotos が photos.released を消費する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const { m, listing, target } = await publishedListing(k, 2);
      const [A] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      await k.takeDown(op, claimId, target, [A]);
      const [released] = await k.events("photos.released");
      if (released === undefined) throw new Error("no photos.released");
      await discardReleasedPhotos.handle(
        k.container,
        eventDecoders["photos.released"](released.payload, {
          id: EventId.create(k.newId()),
          occurredAt: released.occurredAt,
          aggregateId: released.aggregateId,
        }),
      );
      const found = await k.run(({ photoAssetRepository }) =>
        photoAssetRepository.findByIds([A]),
      );
      expect(found).toEqual([]);
      await expectCode(
        k.container.photoStorage.copy(A, PhotoId.create(k.newId())),
        NotFoundError,
      );
      await expectBusinessRuleError(
        Promise.resolve().then(() =>
          PhotoOwnership.claimAll(
            [],
            [A],
            { kind: "listing", id: listing.id },
            m.actor,
          ),
        ),
        MediaErrorCode.PhotoNotAvailable,
      );
    });

    it("takeDownPhotosByClaim#3 写真 A・B を持つ店舗 P。申立人が示した写真は A / 申立てに基づいて、示されていない写真 B を削除する", async () => {
      const k = await moderationKit();
      const place = await k.placeWithPhotos(2);
      const [A, B] = two(place.photos);
      const target = { kind: "place", id: place.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      await k.takeDown(await k.operator(), claimId, target, [B]);
      expect(
        photoIdsOf((await k.storedPlace(place.id)).entity.profile.photos),
      ).toEqual([A]);
    });

    it("takeDownPhotosByClaim#4 存在しない TakedownClaimId / その ID と掲載 L を渡して写真を削除する", async () => {
      const k = await moderationKit();
      const { listing, target } = await publishedListing(k, 1);
      const [photo] = listing.photos;
      if (photo === undefined) throw new Error("photo");
      const before = await k.stored(listing.id);
      await expectCode(
        k.takeDown(
          await k.operator(),
          TakedownClaimId.create(k.newId()),
          target,
          [photo],
        ),
        NotFoundError,
        "TAKEDOWN_CLAIM_NOT_FOUND",
      );
      expect(await k.stored(listing.id)).toEqual(before);
    });

    it("takeDownPhotosByClaim#5 対応済みの申立て（別のサービス運営者が先に対応を終えた） / 申立てに基づいて写真を削除する", async () => {
      const k = await moderationKit();
      const [opA, opB] = [await k.operator(), await k.operator()];
      const { listing, target } = await publishedListing(k, 2);
      const [A] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      await k.resolveClaim(opB, claimId);
      const before = await k.stored(listing.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(opA, claimId, target, [A]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
      );
      expect(await k.stored(listing.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });

    it("takeDownPhotosByClaim#6 地域 R1 を対象にした未対応の申立て。地域 R2 は写真を持つ / 申立てと R2 を渡して、R2 の写真を削除する", async () => {
      const k = await moderationKit();
      const R1 = await k.regionWithPhotos(1);
      const R2 = await k.regionWithPhotos(1);
      const claimId = await k.claim({
        target: { kind: "region", id: R1.id },
        photoIds: R1.photos,
      });
      const [photo] = R2.photos;
      if (photo === undefined) throw new Error("photo");
      const before = await k.storedRegion(R2.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, { kind: "region", id: R2.id }, [
          photo,
        ]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH",
      );
      expect(await k.storedRegion(R2.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });

    it("refuses another target of the same kind (#6 on places)", async () => {
      const k = await moderationKit();
      const P1 = await k.placeWithPhotos(1);
      const P2 = await k.placeWithPhotos(1);
      const claimId = await k.claim({ target: { kind: "place", id: P1.id } });
      const [photo] = P2.photos;
      if (photo === undefined) throw new Error("photo");
      const before = await k.storedPlace(P2.id);
      await expectCode(
        k.takeDown(await k.operator(), claimId, { kind: "place", id: P2.id }, [
          photo,
        ]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH",
      );
      expect(await k.storedPlace(P2.id)).toEqual(before);
    });

    it("takeDownPhotosByClaim#7 同じ ID の掲載と店舗がある。掲載を対象にした未対応の申立て / 申立てと店舗を渡して、店舗の写真を削除する", async () => {
      const k = await moderationKit();
      const { listing, target } = await publishedListing(k, 1);
      const sameId = PlaceId.create(listing.id);
      const photo = listing.photos[0];
      if (photo === undefined) throw new Error("photo");
      const { entity } = Place.register(
        { id: sameId, profile: sampleProfile({ photoIds: [photo] }) },
        k.clock.now(),
      );
      await k.run(({ placeRepository }) => placeRepository.insert(entity));
      const claimId = await k.claim({ target });
      await expectCode(
        k.takeDown(await k.operator(), claimId, { kind: "place", id: sameId }, [
          photo,
        ]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH",
      );
      expect((await k.storedPlace(sameId)).entity).toEqual(entity);
    });

    it("takeDownPhotosByClaim#8 イベント O1 を対象にした対応済みの申立て。イベント O2 は写真を持つ / 申立てと O2 を渡して、O2 の写真を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const O1 = await k.occasionWithPhotos(1);
      const O2 = await k.occasionWithPhotos(1);
      const claimId = await k.claim({
        target: { kind: "occasion", id: O1.id },
        photoIds: O1.photos,
      });
      await k.resolveClaim(op, claimId);
      const [photo] = O2.photos;
      if (photo === undefined) throw new Error("photo");
      const before = await k.storedOccasion(O2.id);
      await expectCode(
        k.takeDown(op, claimId, { kind: "occasion", id: O2.id }, [photo]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
      );
      expect(await k.storedOccasion(O2.id)).toEqual(before);
    });

    it("checks the resolved claim before the target match (#8 on places)", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const P1 = await k.placeWithPhotos(1);
      const P2 = await k.placeWithPhotos(1);
      const claimId = await k.claim({ target: { kind: "place", id: P1.id } });
      await k.resolveClaim(op, claimId);
      const [photo] = P2.photos;
      if (photo === undefined) throw new Error("photo");
      await expectCode(
        k.takeDown(op, claimId, { kind: "place", id: P2.id }, [photo]),
        BusinessRuleError,
        "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
      );
    });

    it("takeDownPhotosByClaim#9 掲載 L を対象にした未対応の申立て。L は対応の前に削除されている / 申立てと L を渡して写真を削除する", async () => {
      const k = await moderationKit();
      const { m, listing, target } = await publishedListing(k, 1);
      const claimId = await k.claim({ target });
      await k.remove(m, listing.id);
      const [photo] = listing.photos;
      if (photo === undefined) throw new Error("photo");
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [photo]),
        NotFoundError,
        "CONTENT_NOT_FOUND",
      );
    });

    it("takeDownPhotosByClaim#10 写真 A・B を持つ掲載 L を対象にした未対応の申立て。写真の削除の要求が L を読んだ後に、店舗管理者の L の保存が先にコミットした / 写真の削除の要求がコミットする", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const { m, listing, target } = await publishedListing(k, 2);
      const [A, B] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      const mark = await k.mark();
      const racing = commitAfter(k.container, () =>
        k.saveName(m, listing.id, "先に保存"),
      );
      await expectCode(
        k.takeDown(op, claimId, target, [A], racing),
        ConflictError,
      );
      const stored = (await k.stored(listing.id)).entity;
      expect(stored.content.name).toBe("先に保存");
      expect(photoIdsOf(stored.content.photos)).toEqual([A, B]);
      expect(
        (await k.since(mark)).filter(
          (e) =>
            e.type === "content.photos_taken_down" ||
            e.type === "photos.released",
        ),
      ).toEqual([]);
    });

    it("takeDownPhotosByClaim#11 操作する人は掲載 L の店舗の店舗管理者で、サービス運営者の役割を持たない / 申立てに基づいて L の写真を削除する", async () => {
      const k = await moderationKit();
      const { m, listing, target } = await publishedListing(k, 2);
      const [A] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = await k.stored(listing.id);
      await expectCode(k.takeDown(m, claimId, target, [A]), ForbiddenError);
      expect(await k.stored(listing.id)).toEqual(before);
    });

    it("takeDownPhotosByClaim#12 操作する人は編集担当者で、サービス運営者の役割を持たない。読みもの A1 を対象にした未対応の申立て / 申立てに基づいて A1 の写真を削除する", async () => {
      const k = await moderationKit();
      const editor = await k.editor();
      const A1 = await k.articleWithPhotos(2);
      const [A] = two(A1.photos);
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = await k.storedArticle(A1.id);
      await expectCode(
        k.takeDown(editor, claimId, target, [A]),
        ForbiddenError,
      );
      expect(await k.storedArticle(A1.id)).toEqual(before);
    });

    it("refuses an editor without the operator role on a listing", async () => {
      const k = await moderationKit();
      const editor = await k.editor();
      const { listing, target } = await publishedListing(k, 2);
      const [A] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = await k.stored(listing.id);
      await expectCode(
        k.takeDown(editor, claimId, target, [A]),
        ForbiddenError,
      );
      expect(await k.stored(listing.id)).toEqual(before);
    });

    it("takeDownPhotosByClaim#13 管理者のいない店舗 P。編集担当者の名簿が0人で、読みもの A1 がある。それぞれを対象にした未対応の申立て / サービス運営者が、それぞれの写真を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const place = await k.placeWithPhotos(2);
      const [pA, pB] = two(place.photos);
      const placeTarget = { kind: "place", id: place.id } as const;
      const A1 = await k.articleWithPhotos(2);
      const [aA, aB] = two(A1.photos);
      const articleTarget = { kind: "article", id: A1.id } as const;
      const editors = await k.run(({ roleRosterRepository }) =>
        roleRosterRepository.find("editor"),
      );
      expect(RoleRoster.holders(editors.entity)).toEqual([]);
      const placeClaim = await k.claim({
        target: placeTarget,
        photoIds: [pA],
      });
      const articleClaim = await k.claim({
        target: articleTarget,
        photoIds: [aA],
      });
      await k.takeDown(op, placeClaim, placeTarget, [pA]);
      await k.takeDown(op, articleClaim, articleTarget, [aA]);
      expect(
        photoIdsOf((await k.storedPlace(place.id)).entity.profile.photos),
      ).toEqual([pB]);
      expect(
        photoIdsOf((await k.storedArticle(A1.id)).entity.content.photos),
      ).toEqual([aB]);
    });
  });

  describe("店舗", () => {
    it("takeDownPhotosByClaim#14 店舗 P の写真は ph1、ph2、ph3 の順 / ph1 を削除する", async () => {
      const k = await moderationKit();
      const place = await k.placeWithPhotos(3);
      const [ph1, ph2, ph3] = three(place.photos);
      const target = { kind: "place", id: place.id } as const;
      const claimId = await k.claim({ target, photoIds: [ph1] });
      const before = (await k.storedPlace(place.id)).entity;
      const output = await k.takeDown(await k.operator(), claimId, target, [
        ph1,
      ]);
      expect(output).toEqual({ publication: null, unpublished: false });
      const after = (await k.storedPlace(place.id)).entity;
      expect(photoIdsOf(after.profile.photos)).toEqual([ph2, ph3]);
      expect(after.profile.photos.items[0]?.photoId).toBe(ph2);
      expect(after.version).toBe(before.version + 1);
      expect(after.suspension).toEqual({ suspended: false });
    });

    it("takeDownPhotosByClaim#15 店舗 P の写真は ph1 の1枚だけ / ph1 を削除する", async () => {
      const k = await moderationKit();
      const place = await k.placeWithPhotos(1);
      const [ph1] = place.photos;
      if (ph1 === undefined) throw new Error("photo");
      const target = { kind: "place", id: place.id } as const;
      const claimId = await k.claim({ target, photoIds: [ph1] });
      const before = (await k.storedPlace(place.id)).entity;
      const mark = await k.mark();
      await k.takeDown(await k.operator(), claimId, target, [ph1]);
      const after = (await k.storedPlace(place.id)).entity;
      expect(after.profile.photos.items).toEqual([]);
      expect(after.suspension).toEqual({ suspended: false });
      expect(after.operatingStatus).toBe(before.operatingStatus);
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [ph1], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [ph1] } },
      ]);
    });

    it("takeDownPhotosByClaim#16 非公開の店舗 P が写真 ph1・ph2 を持つ / ph1 を削除する", async () => {
      const k = await moderationKit();
      const place = await k.placeWithPhotos(2);
      const [ph1, ph2] = two(place.photos);
      const target = { kind: "place", id: place.id } as const;
      const claimId = await k.claim({ target, photoIds: [ph1] });
      await k.suspendPlace(place.id);
      await k.takeDown(await k.operator(), claimId, target, [ph1]);
      const after = (await k.storedPlace(place.id)).entity;
      expect(photoIdsOf(after.profile.photos)).toEqual([ph2]);
      expect(after.suspension).toEqual({ suspended: true });
    });

    it("takeDownPhotosByClaim#17 店舗 P の写真は ph2、ph3（ph1 は店舗管理者が先に外した） / ph1 と ph2 を削除する", async () => {
      const k = await moderationKit();
      const place = await k.placeWithPhotos(3, "店舗");
      const [ph1, ph2, ph3] = three(place.photos);
      const target = { kind: "place", id: place.id } as const;
      const claimId = await k.claim({ target, photoIds: [ph1] });
      await k.changePlace(
        place.id,
        (p, now) =>
          Place.updateProfile(
            p,
            sampleProfile({ name: "店舗", photoIds: [ph2, ph3] }),
            now,
          ).entity,
      );
      const before = await k.storedPlace(place.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [ph1, ph2]),
        BusinessRuleError,
        "PLACE_PHOTO_NOT_FOUND",
      );
      expect(await k.storedPlace(place.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });
  });

  describe("掲載", () => {
    it("takeDownPhotosByClaim#18 公開中の掲載 L の写真は P1、P2、P3 の順 / P1 と P3 を1回で削除する", async () => {
      const k = await moderationKit();
      const { listing, target } = await publishedListing(k, 3);
      const [P1, P2, P3] = three(listing.photos);
      const claimId = await k.claim({ target, photoIds: [P1] });
      const mark = await k.mark();
      await k.takeDown(await k.operator(), claimId, target, [P1, P3]);
      const stored = (await k.stored(listing.id)).entity;
      expect(photoIdsOf(stored.content.photos)).toEqual([P2]);
      expect(stored.publication.status).toBe("published");
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [P1, P3], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [P1, P3] } },
      ]);
    });

    it("takeDownPhotosByClaim#19 公開中の掲載 L の写真は1枚だけ / その写真を削除する", async () => {
      const k = await moderationKit();
      const { listing, target } = await publishedListing(k, 1);
      const [photo] = listing.photos;
      if (photo === undefined) throw new Error("photo");
      const claimId = await k.claim({ target, photoIds: [photo] });
      const before = (await k.stored(listing.id)).entity;
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [
        photo,
      ]);
      expect(output).toEqual({ publication: "unpublished", unpublished: true });
      const stored = (await k.stored(listing.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toEqual({
        status: "unpublished",
        reason: "photoTakedown",
        firstPublishedAt:
          before.publication.status === "published"
            ? before.publication.firstPublishedAt
            : null,
      });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [photo], unpublished: true },
        },
        {
          type: "listing.unpublished",
          payload: { listingId: listing.id, reason: "photoTakedown" },
        },
        { type: "photos.released", payload: { photoIds: [photo] } },
      ]);
    });

    it("takeDownPhotosByClaim#20 公開中で運営による非公開の掲載 L の写真は1枚だけ / その写真を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const { listing, target } = await publishedListing(k, 1);
      const [photo] = listing.photos;
      if (photo === undefined) throw new Error("photo");
      const claimId = await k.claim({ target, photoIds: [photo] });
      await k.suspend(op, listing.id);
      await k.takeDown(op, claimId, target, [photo]);
      const stored = (await k.stored(listing.id)).entity;
      expect(stored.publication).toMatchObject({
        status: "unpublished",
        reason: "photoTakedown",
      });
      expect(stored.suspension).toEqual({ suspended: true });
    });

    it('takeDownPhotosByClaim#21 管理する人が一時非公開にした掲載 L（reason: "byManager"）の写真は1枚だけ / その写真を削除する', async () => {
      const k = await moderationKit();
      const { m, listing, target } = await publishedListing(k, 1);
      const [photo] = listing.photos;
      if (photo === undefined) throw new Error("photo");
      const claimId = await k.claim({ target, photoIds: [photo] });
      await k.unpublish(m, listing.id);
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [
        photo,
      ]);
      expect(output).toEqual({
        publication: "unpublished",
        unpublished: false,
      });
      const stored = (await k.stored(listing.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toMatchObject({
        status: "unpublished",
        reason: "byManager",
      });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [photo], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [photo] } },
      ]);
    });

    it("takeDownPhotosByClaim#22 掲載 L の写真は P2 だけ（示された P1 は店舗管理者が先に外した） / P1 と P2 を削除する", async () => {
      const k = await moderationKit();
      const { m, listing, target } = await publishedListing(k, 2);
      const [P1, P2] = two(listing.photos);
      const claimId = await k.claim({ target, photoIds: [P1] });
      await keepOnly(k, m, listing.id, [P2]);
      const before = await k.stored(listing.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [P1, P2]),
        BusinessRuleError,
        "LISTING_PHOTO_NOT_FOUND",
      );
      expect(await k.stored(listing.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });
  });

  describe("地域", () => {
    it("takeDownPhotosByClaim#23 公開中の地域 R の写真は A・B・C の順 / A を削除する", async () => {
      const k = await moderationKit();
      const R = await k.regionWithPhotos(3);
      const [A, B, C] = three(R.photos);
      const target = { kind: "region", id: R.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({ publication: "published", unpublished: false });
      const stored = (await k.storedRegion(R.id)).entity;
      expect(photoIdsOf(stored.content.photos)).toEqual([B, C]);
      expect(stored.content.photos.items[0]?.photoId).toBe(B);
      expect(stored.publication.status).toBe("published");
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });

    it("takeDownPhotosByClaim#24 公開中の地域 R の写真は A だけ / A を削除する", async () => {
      const k = await moderationKit();
      const R = await k.regionWithPhotos(1);
      const [A] = R.photos;
      if (A === undefined) throw new Error("photo");
      const target = { kind: "region", id: R.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = (await k.storedRegion(R.id)).entity;
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({ publication: "unpublished", unpublished: true });
      const stored = (await k.storedRegion(R.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toEqual({
        status: "unpublished",
        reason: "photoTakedown",
        firstPublishedAt:
          before.publication.status === "published"
            ? before.publication.firstPublishedAt
            : null,
      });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: true },
        },
        {
          type: "region.unpublished",
          payload: { regionId: R.id, reason: "photoTakedown" },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });

    it("takeDownPhotosByClaim#25 下書きの地域 R の写真は A だけ / A を削除する", async () => {
      const k = await moderationKit();
      const R = await k.regionWithPhotos(1, "draft");
      const [A] = R.photos;
      if (A === undefined) throw new Error("photo");
      const target = { kind: "region", id: R.id } as const;
      const claimId = await storeClaim(k, target, [A]);
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({ publication: "draft", unpublished: false });
      const stored = (await k.storedRegion(R.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication.status).toBe("draft");
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });

    it("takeDownPhotosByClaim#26 地域 R は写真 A を持つ / A と、R が持たない写真 X を削除する", async () => {
      const k = await moderationKit();
      const R = await k.regionWithPhotos(1);
      const [A] = R.photos;
      if (A === undefined) throw new Error("photo");
      const X = PhotoId.create(k.newId());
      const target = { kind: "region", id: R.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = await k.storedRegion(R.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [A, X]),
        BusinessRuleError,
        "REGION_PHOTO_NOT_FOUND",
      );
      expect(await k.storedRegion(R.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });
  });

  describe("イベント", () => {
    it("takeDownPhotosByClaim#27 公開中のイベント O の写真は A、B の順 / A を削除する", async () => {
      const k = await moderationKit();
      const O = await k.occasionWithPhotos(2);
      const [A, B] = two(O.photos);
      const target = { kind: "occasion", id: O.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({ publication: "published", unpublished: false });
      const stored = (await k.storedOccasion(O.id)).entity;
      expect(photoIdsOf(stored.content.photos)).toEqual([B]);
      expect(stored.content.photos.items[0]?.photoId).toBe(B);
      expect(stored.publication.status).toBe("published");
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });

    it("takeDownPhotosByClaim#28 公開中で運営による非公開のイベント O の写真は A だけ / A を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const O = await k.occasionWithPhotos(1);
      const [A] = O.photos;
      if (A === undefined) throw new Error("photo");
      const target = { kind: "occasion", id: O.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      await suspendOccasion({
        container: k.container,
        actor: op.actor,
        input: { occasionId: O.id },
      });
      const mark = await k.mark();
      const output = await k.takeDown(op, claimId, target, [A]);
      expect(output).toEqual({ publication: "unpublished", unpublished: true });
      const stored = (await k.storedOccasion(O.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toMatchObject({
        status: "unpublished",
        reason: "photoTakedown",
      });
      expect(stored.suspension).toEqual({ suspended: true });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: true },
        },
        {
          type: "occasion.unpublished",
          payload: { occasionId: O.id, reason: "photoTakedown" },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });

    it("takeDownPhotosByClaim#29 イベント O の写真は B だけ（A はイベント運営者が先に外した） / A を削除する", async () => {
      const k = await moderationKit();
      const O = await k.occasionWithPhotos(2);
      const [A, B] = two(O.photos);
      const target = { kind: "occasion", id: O.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const steward = await k.person("occasion-steward");
      await k.appoint(target, steward);
      const read = (await k.storedOccasion(O.id)).entity;
      await updateOccasionContent({
        container: k.container,
        actor: steward.actor,
        input: {
          occasionId: O.id,
          version: read.version,
          content: { ...fieldsOf(read), photoIds: [B] },
        },
      });
      const before = await k.storedOccasion(O.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [A]),
        BusinessRuleError,
        "OCCASION_PHOTO_NOT_FOUND",
      );
      expect(await k.storedOccasion(O.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });
  });

  describe("読みもの", () => {
    it("takeDownPhotosByClaim#30 公開中の読みもの A1 の写真は A・B / A と B を1回で削除する", async () => {
      const k = await moderationKit();
      const A1 = await k.articleWithPhotos(2);
      const [A, B] = two(A1.photos);
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      const before = (await k.storedArticle(A1.id)).entity;
      if (before.publication.status !== "published") throw new Error("state");
      expect(await k.container.referenceQueries.isViewable(target)).toBe(true);
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [
        A,
        B,
      ]);
      expect(output).toEqual({ publication: "unpublished", unpublished: true });
      const stored = (await k.storedArticle(A1.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.content.photos.takenDown).toBe(true);
      expect(stored.publication).toEqual({
        status: "unpublished",
        firstPublishedAt: before.publication.firstPublishedAt,
        reason: "photoTakedown",
      });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A, B], unpublished: true },
        },
        { type: "photos.released", payload: { photoIds: [A, B] } },
      ]);
      expect(await k.container.referenceQueries.isViewable(target)).toBe(false);
    });
    it("takeDownPhotosByClaim#31 公開中の読みもの A1 の写真は A・B / 同じ申立てに基づいて A を削除し、続けて別の要求で B を削除する", async () => {
      const k = await moderationKit();
      const op = await k.operator();
      const A1 = await k.articleWithPhotos(2);
      const [A, B] = two(A1.photos);
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await k.claim({ target, photoIds: [A, B] });
      expect(await k.takeDown(op, claimId, target, [A])).toEqual({
        publication: "published",
        unpublished: false,
      });
      const first = (await k.storedArticle(A1.id)).entity;
      expect(photoIdsOf(first.content.photos)).toEqual([B]);
      expect(first.publication.status).toBe("published");
      expect(await k.takeDown(op, claimId, target, [B])).toEqual({
        publication: "unpublished",
        unpublished: true,
      });
      expect((await k.storedArticle(A1.id)).entity.publication).toMatchObject({
        status: "unpublished",
        reason: "photoTakedown",
      });
    });
    it("takeDownPhotosByClaim#32 下書きの読みもの A1 の写真は A だけ / A を削除する", async () => {
      const k = await moderationKit();
      const A1 = await k.articleWithPhotos(1, "draft");
      const [A] = A1.photos;
      if (A === undefined) throw new Error("photo");
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await storeClaim(k, target, [A]);
      const mark = await k.mark();
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({ publication: "draft", unpublished: false });
      const stored = (await k.storedArticle(A1.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toEqual({ status: "draft" });
      expect(await eventsSince(k, mark)).toEqual([
        {
          type: "content.photos_taken_down",
          payload: { owner: target, photoIds: [A], unpublished: false },
        },
        { type: "photos.released", payload: { photoIds: [A] } },
      ]);
    });
    it('takeDownPhotosByClaim#33 編集担当者が公開を取り下げた読みもの A1（reason: "byManager"）の写真は A だけ / A を削除する', async () => {
      const k = await moderationKit();
      const A1 = await k.articleWithPhotos(1, "unpublished");
      const [A] = A1.photos;
      if (A === undefined) throw new Error("photo");
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await storeClaim(k, target, [A]);
      const before = (await k.storedArticle(A1.id)).entity;
      const output = await k.takeDown(await k.operator(), claimId, target, [A]);
      expect(output).toEqual({
        publication: "unpublished",
        unpublished: false,
      });
      const stored = (await k.storedArticle(A1.id)).entity;
      expect(stored.content.photos.items).toEqual([]);
      expect(stored.publication).toEqual(before.publication);
      expect(stored.publication).toMatchObject({ reason: "byManager" });
    });
    it("takeDownPhotosByClaim#34 読みもの A1 の写真は B だけ（A は編集担当者が先に外した） / A と B を削除する", async () => {
      const k = await moderationKit();
      const A1 = await k.articleWithPhotos(2);
      const [A, B] = two(A1.photos);
      const target = { kind: "article", id: A1.id } as const;
      const claimId = await k.claim({ target, photoIds: [A] });
      await k.changeArticle(
        A1.id,
        (article, now) =>
          Article.revise(
            article,
            {
              title: article.content.title ?? "",
              body: article.content.body ?? "",
              photoIds: [B],
              showcases: article.content.showcases,
            },
            now,
          ).entity,
      );
      const before = await k.storedArticle(A1.id);
      const mark = await k.mark();
      await expectCode(
        k.takeDown(await k.operator(), claimId, target, [A, B]),
        BusinessRuleError,
        "ARTICLE_PHOTO_NOT_FOUND",
      );
      expect(await k.storedArticle(A1.id)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    });
  });

  describe("beyond the spec rows", () => {
    it("reads a region, occasion or article that is not stored as missing", async () => {
      const k = await moderationKit();
      for (const target of [
        { kind: "region", id: RegionId.create(k.newId()) },
        { kind: "occasion", id: OccasionId.create(k.newId()) },
        { kind: "article", id: ArticleId.create(k.newId()) },
      ] as const) {
        const photo = PhotoId.create(k.newId());
        const claimId = await storeClaim(k, target, [photo]);
        await expectCode(
          k.takeDown(await k.operator(), claimId, target, [photo]),
          NotFoundError,
          "CONTENT_NOT_FOUND",
        );
      }
    });

    it("refuses a region steward without the operator role", async () => {
      const k = await moderationKit();
      const R = await k.regionWithPhotos(1);
      const target = { kind: "region", id: R.id } as const;
      const claimId = await k.claim({ target, photoIds: R.photos });
      const [photo] = R.photos;
      if (photo === undefined) throw new Error("photo");
      const regionSteward = await k.person("region-steward");
      await k.appoint(target, regionSteward);
      const before = await k.storedRegion(R.id);
      await expectCode(
        k.takeDown(regionSteward, claimId, target, [photo]),
        ForbiddenError,
      );
      expect(await k.storedRegion(R.id)).toEqual(before);
    });
  });
});
