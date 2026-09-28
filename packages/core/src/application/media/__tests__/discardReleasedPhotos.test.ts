import { expectBusinessRuleError } from "@repo/core/adapters/do/__conformance__/assertions";
import { EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../errors";
import { eventDecoders } from "../../events/registry";
import { moderationKit } from "../../moderation/__tests__/kit";
import { discardReleasedPhotos } from "../discardReleasedPhotos";
import { type MediaKit, mediaKit } from "./kit";

const consume = (k: MediaKit, photoIds: readonly PhotoId[]) =>
  discardReleasedPhotos.handle(k.container, k.released(photoIds));

/** Two `stored` photos of one article, and the article's manager. */
async function articlePhotos(k: MediaKit) {
  const editor = k.person();
  const article = k.owner("article");
  const a = await k.register(editor);
  const b = await k.register(editor);
  await k.claim(a, article, editor);
  await k.claim(b, article, editor);
  return { editor, article, a, b };
}

describe("discardReleasedPhotos", () => {
  it("discardReleasedPhotos#1 読みものを持ち主とする stored の写真が2枚 / 2枚の PhotoId を載せた photos.released を消費する", async () => {
    const k = mediaKit();
    const { a, b } = await articlePhotos(k);
    await consume(k, [a, b]);
    await k.expectNoPhoto(a);
    await k.expectNoPhoto(b);
    expect(await k.storedEvents()).toEqual([]);
  });

  it("discardReleasedPhotos#2 上の消費の後 / 同じ photos.released をもう一度消費する", async () => {
    const k = mediaKit();
    const { a, b } = await articlePhotos(k);
    const event = k.released([a, b]);
    await discardReleasedPhotos.handle(k.container, event);
    await expect(
      discardReleasedPhotos.handle(k.container, event),
    ).resolves.toBeUndefined();
    await k.expectNoPhoto(a);
    await k.expectNoPhoto(b);
  });

  it("discardReleasedPhotos#3 記録のない PhotoId と、stored の写真の PhotoId / 両方を載せた photos.released を消費する", async () => {
    const k = mediaKit();
    const photo = await k.register(k.person());
    await expect(
      consume(k, [PhotoId.create(k.newPhotoId()), photo]),
    ).resolves.toBeUndefined();
    await k.expectNoPhoto(photo);
  });

  it("discardReleasedPhotos#4 実体の削除で失敗し、discarded のまま残った写真と、前の消費で削除された写真 / 同じ photos.released の再配送を消費する", async () => {
    const k = mediaKit();
    const { a, b } = await articlePhotos(k);
    const event = k.released([a, b]);
    k.storage.fail("delete", a);
    await expect(
      discardReleasedPhotos.handle(k.container, event),
    ).rejects.toBeInstanceOf(AggregateError);
    expect((await k.get(a)).entity.stage).toBe("discarded");
    await k.expectNoPhoto(b);
    k.storage.heal();
    await discardReleasedPhotos.handle(k.container, event);
    await k.expectNoPhoto(a);
    await k.expectNoPhoto(b);
  });

  it("discardReleasedPhotos#5 stored の写真が2枚。1枚目の PhotoStorage.delete が失敗する / 2枚を載せた photos.released を消費する", async () => {
    const k = mediaKit();
    const { editor, a, b } = await articlePhotos(k);
    k.storage.fail("delete", a);
    await expect(consume(k, [a, b])).rejects.toBeInstanceOf(AggregateError);
    await k.expectNoPhoto(b);
    const left = await k.get(a);
    expect(left.entity.stage).toBe("discarded");
    await expectBusinessRuleError(
      Promise.resolve().then(() =>
        PhotoOwnership.claimAll([left.entity], [a], k.owner("listing"), editor),
      ),
      MediaErrorCode.PhotoNotAvailable,
    );
  });

  it("discardReleasedPhotos#6 申立てで削除された写真（MOD-02） / takeDownPhotosByClaim が出した photos.released を消費する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    const m = await k.manager(placeId);
    const listing = await k.listingWithPhotos(m, placeId, 2);
    const [A] = listing.photos;
    if (A === undefined) throw new Error("photo");
    const target = { kind: "listing", id: listing.id } as const;
    const claimId = await k.claim({ target, photoIds: [A] });
    await k.takeDown(await k.operator(), claimId, target, [A]);
    const [stored] = await k.events("photos.released");
    if (stored === undefined) throw new Error("no photos.released");
    await discardReleasedPhotos.handle(
      k.container,
      eventDecoders["photos.released"](stored.payload, {
        id: EventId.create(k.newId()),
        occurredAt: stored.occurredAt,
        aggregateId: stored.aggregateId,
      }),
    );
    const found = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findByIds([A]),
    );
    expect(found).toEqual([]);
    await expect(
      k.container.photoStorage.copy(A, PhotoId.create(k.newId())),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expectBusinessRuleError(
      Promise.resolve().then(() =>
        PhotoOwnership.claimAll(
          found.map((f) => f.entity),
          [A],
          { kind: "place", id: placeId },
          m.actor,
        ),
      ),
      MediaErrorCode.PhotoNotAvailable,
    );
  });

  it("discardReleasedPhotos#7 photos.released に載っていない、同じ読みものの別の写真 / photos.released を消費する", async () => {
    const k = mediaKit();
    const { a, b } = await articlePhotos(k);
    const before = await k.get(b);
    const content = await k.served(b);
    await consume(k, [a]);
    expect(await k.get(b)).toEqual(before);
    expect(await k.served(b)).toEqual(content);
  });

  it("a photo deleted on release cannot be claimed by any owner", async () => {
    const k = mediaKit();
    const { editor, a } = await articlePhotos(k);
    await consume(k, [a]);
    const found = await k.uow.inner.run(({ photoAssetRepository }) =>
      photoAssetRepository.findByIds([a]),
    );
    await expectBusinessRuleError(
      Promise.resolve().then(() =>
        PhotoOwnership.claimAll(
          found.map((f) => f.entity),
          [a],
          k.owner("place"),
          editor,
        ),
      ),
      MediaErrorCode.PhotoNotAvailable,
    );
  });

  it("deletes an accepted photo that was released", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    k.storage.fail("put", id);
    await expect(k.register(alice, { photoId })).rejects.toThrow();
    await consume(k, [id]);
    await k.expectNoPhoto(id);
  });
});
