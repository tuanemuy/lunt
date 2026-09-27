import { expectBusinessRuleError } from "@repo/core/adapters/do/__conformance__/assertions";
import {
  pngOfLength,
  sampleJpeg,
  sampleVideo,
  truncated,
} from "@repo/core/adapters/photos/testing/photoSamples";
import { PhotoId } from "@repo/core/domain/common/ids";
import { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import { PhotoDigest } from "@repo/core/domain/media/photoFile";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../errors";
import { discardReleased } from "../discardReleasedPhotos";
import { sweepUnownedPhotos } from "../sweepUnownedPhotos";
import { InjectedStorageFailure, mediaKit } from "./kit";
import { TEST_PHOTO_MAX_BYTES } from "./testServices";

describe("registerPhoto", () => {
  it("registerPhoto#1 ログインした利用者。静止画のファイル / 同意して、新しい PhotoId で登録する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const bytes = k.bytes();
    const registeredAt = k.clock.now();
    const id = await k.register(alice, { bytes });
    const photo = await k.get(id);
    expect(photo.entity).toMatchObject({
      stage: "stored",
      owner: null,
      registeredBy: alice.accountId,
      consentedAt: registeredAt,
      registeredAt,
      digest: PhotoDigest.of(bytes),
    });
    expect(await k.served(id)).toEqual(bytes);
    expect(await k.storedEvents()).toEqual([]);
  });

  it("registerPhoto#2 ログインした利用者。静止画のファイル / 同意せずに登録する", async () => {
    const k = mediaKit();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    await expectBusinessRuleError(
      k.register(k.person(), { photoId, agreed: false }),
      MediaErrorCode.InvalidConsent,
    );
    await k.expectNoPhoto(id);
  });

  it("registerPhoto#3 ログインした利用者 / 同意して、動画のファイルを登録する", async () => {
    const k = mediaKit();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    await expectBusinessRuleError(
      k.register(k.person(), { photoId, bytes: sampleVideo() }),
      MediaErrorCode.NotAPhoto,
    );
    await k.expectNoPhoto(id);
  });

  it("registerPhoto#4 ログインした利用者 / 同意して、壊れたファイルを、静止画の形式として申告して登録する", async () => {
    const k = mediaKit();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    // The input has no declared type at all: only the content is judged.
    await expectBusinessRuleError(
      k.register(k.person(), { photoId, bytes: truncated(sampleJpeg()) }),
      MediaErrorCode.NotAPhoto,
    );
    await k.expectNoPhoto(id);
  });

  it("registerPhoto#5 実体を置くところで失敗し、accepted のまま残った写真 / 登録した人が、同じ PhotoId と同じファイルで送り直す", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    const bytes = k.bytes();
    k.storage.fail("put", id);
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      InjectedStorageFailure,
    );
    const first = (await k.get(id)).entity;
    expect(first.stage).toBe("accepted");
    k.storage.heal();
    k.clock.advance(60_000);
    await k.register(alice, { photoId, bytes });
    const after = await k.get(id);
    expect(after.entity).toMatchObject({
      stage: "stored",
      registeredBy: first.registeredBy,
      consentedAt: first.consentedAt,
      registeredAt: first.registeredAt,
    });
    expect(after.expectedVersion).toBe(first.version + 1);
    expect(await k.served(id)).toEqual(bytes);
  });

  it("registerPhoto#6 登録が成立して stored になった写真 / 登録した人が、同じ PhotoId と同じファイルで送り直す", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const bytes = k.bytes();
    const id = await k.register(alice, { photoId, bytes });
    const before = await k.get(id);
    await k.register(alice, { photoId, bytes });
    expect(await k.get(id)).toEqual(before);
  });

  it("registerPhoto#7 実体を置くところで失敗し、accepted のまま残った写真 / 登録した人が、同じ PhotoId で別のファイルを送る", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    k.storage.fail("put", id);
    await expect(k.register(alice, { photoId })).rejects.toBeInstanceOf(
      InjectedStorageFailure,
    );
    k.storage.heal();
    await expect(k.register(alice, { photoId })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await k.get(id)).entity.stage).toBe("accepted");
    expect(await k.served(id)).toBeNull();
  });

  it("registerPhoto#8 登録が成立して stored になった写真 / 登録した人が、同じ PhotoId で別のファイルを送る", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const bytes = k.bytes();
    const id = await k.register(alice, { photoId, bytes });
    const before = await k.get(id);
    await expect(k.register(alice, { photoId })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await k.get(id)).toEqual(before);
    expect(await k.served(id)).toEqual(bytes);
  });

  it("registerPhoto#9 別の人が登録した写真 / その写真と同じ PhotoId で登録する", async () => {
    const k = mediaKit();
    const photoId = k.newPhotoId();
    const bytes = k.bytes();
    const id = await k.register(k.person(), { photoId, bytes });
    const before = await k.get(id);
    await expect(
      k.register(k.person(), { photoId, bytes }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await k.get(id)).toEqual(before);
    expect(await k.served(id)).toEqual(bytes);
  });

  it("registerPhoto#10 登録した写真が破棄され、discarded のまま残っている / 登録した人が、同じ PhotoId で送り直す", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const bytes = k.bytes();
    const id = await k.register(alice, { photoId, bytes });
    k.storage.fail("delete", id);
    await expect(discardReleased(k.container, [id])).rejects.toBeInstanceOf(
      AggregateError,
    );
    k.storage.heal();
    await k.storage.delete(id);
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await k.get(id)).entity.stage).toBe("discarded");
    expect(await k.served(id)).toBeNull();
  });

  it("registerPhoto#11 登録した写真が集約に載った後に手放され、破棄・実体の削除・記録の削除を終えている / 登録した人が、同じ PhotoId と同じファイルで送り直す", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const bytes = k.bytes();
    const id = await k.register(alice, { photoId, bytes });
    await k.claim(id, k.owner("listing"), alice);
    await discardReleased(k.container, [id]);
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await k.expectNoPhoto(id);
  });

  it("registerPhoto#12 残す期間を過ぎた accepted の写真。登録した人が同じ PhotoId と同じファイルで送り直し、1つ目の UnitOfWork で accepted を読んだ後に、sweepUnownedPhotos が破棄・実体の削除・記録の削除を終える。その後に送り直しの PhotoStorage.put が実体を置く / 送り直しが2つ目の UnitOfWork に進む", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    const bytes = k.bytes();
    k.storage.fail("put", id);
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      InjectedStorageFailure,
    );
    k.storage.heal();
    k.passRetention();
    k.storage.onNextPut(id, async () => {
      await sweepUnownedPhotos({
        container: { ...k.container, unitOfWorkProvider: k.uow.inner },
        now: k.clock.now(),
      });
      expect(await k.find(id)).toBeNull();
    });
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await k.expectNoPhoto(id);
    expect(k.storage.bucket.keys()).toEqual([]);
  });

  it("registerPhoto#13 上と同じ順で、掃除は破棄の save だけを終え、記録は discarded で残っている / 送り直しが2つ目の UnitOfWork に進む", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photoId = k.newPhotoId();
    const id = PhotoId.create(photoId);
    const bytes = k.bytes();
    k.storage.fail("put", id);
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      InjectedStorageFailure,
    );
    k.storage.heal();
    k.passRetention();
    k.storage.onNextPut(id, () => k.discardOnly(id));
    await expect(k.register(alice, { photoId, bytes })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await k.get(id)).entity.stage).toBe("discarded");
    expect(await k.served(id)).toBeNull();
  });

  it("registerPhoto#14 同じ人が続けて2枚登録する / それぞれ同意して、別の PhotoId で登録する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const firstAt = k.clock.now();
    const first = await k.register(alice);
    k.clock.advance(5_000);
    const secondAt = k.clock.now();
    const second = await k.register(alice);
    expect((await k.get(first)).entity).toMatchObject({
      stage: "stored",
      consentedAt: firstAt,
    });
    expect((await k.get(second)).entity).toMatchObject({
      stage: "stored",
      consentedAt: secondAt,
    });
  });

  it("a file larger than PhotoPolicy.maxBytes is not a photo, even when well-formed", async () => {
    const k = mediaKit();
    const alice = k.person();
    const largest = pngOfLength(TEST_PHOTO_MAX_BYTES);
    const kept = await k.register(alice, { bytes: largest });
    expect(await k.served(kept)).toEqual(largest);

    const photoId = k.newPhotoId();
    await expectBusinessRuleError(
      k.register(alice, {
        photoId,
        bytes: pngOfLength(TEST_PHOTO_MAX_BYTES + 1, 1),
      }),
      MediaErrorCode.NotAPhoto,
    );
    await k.expectNoPhoto(PhotoId.create(photoId));
  });
});
