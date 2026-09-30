import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import type { Actor } from "@repo/core/domain/common/actor";
import { PhotoId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { createArticle } from "../../article/createArticle";
import type { GeneratedId } from "../../ports/idGenerator";
import { discardReleased } from "../discardReleasedPhotos";
import {
  sweepUnownedPhotos,
  sweepUnownedPhotosJob,
} from "../sweepUnownedPhotos";
import { type MediaKit, mediaKit } from "./kit";

const sweep = (k: MediaKit) =>
  sweepUnownedPhotos({ container: k.container, now: k.clock.now() });

/** A photo left `accepted`: its content upload failed. */
async function acceptedOnly(k: MediaKit): Promise<PhotoId> {
  const photoId = k.newPhotoId();
  const id = PhotoId.create(photoId);
  k.storage.fail("put", id);
  await expect(k.register(k.person(), { photoId })).rejects.toThrow();
  k.storage.heal();
  return id;
}

/**
 * A photo left `accepted` with its content in place: the upload succeeded
 * and the unit of work marking it `stored` failed.
 */
async function acceptedWithContent(k: MediaKit): Promise<PhotoId> {
  const photoId = k.newPhotoId();
  k.uow.beforeCommitOf(2, async () => {
    throw new Error("the unit of work after the upload fails");
  });
  await expect(k.register(k.person(), { photoId })).rejects.toThrow(
    "the unit of work after the upload fails",
  );
  const id = PhotoId.create(photoId);
  expect((await k.get(id)).entity.stage).toBe("accepted");
  expect(await k.served(id)).not.toBeNull();
  return id;
}

/** A person holding the editor role (stored without events). */
async function editorOf(k: MediaKit): Promise<Actor> {
  const editor = k.person();
  await k.uow.inner.run(async ({ roleRosterRepository }) => {
    const read = await roleRosterRepository.find("editor");
    await roleRosterRepository.save(
      RoleRoster.grant(read.entity, editor.accountId, k.clock.now()).entity,
      read.expectedVersion,
    );
  });
  return editor;
}

/** The editor's save of a new article carrying `photoId` (`createArticle`). */
async function saveArticle(
  k: MediaKit,
  editor: Actor,
  articleId: GeneratedId,
  photoId: PhotoId,
): Promise<void> {
  await createArticle({
    container: { ...k.container, unitOfWorkProvider: k.uow.inner },
    actor: editor,
    input: {
      articleId,
      content: {
        title: "読みもの",
        body: "",
        photoIds: [photoId],
        showcases: [],
      },
    },
  });
}

describe("sweepUnownedPhotos", () => {
  it("sweepUnownedPhotos#1 登録から残す期間を過ぎた、持ち主のない stored の写真 / ジョブを実行する", async () => {
    const k = mediaKit();
    const photo = await k.register(k.person());
    k.passRetention();
    const report = await sweep(k);
    await k.expectNoPhoto(photo);
    expect(report).toMatchObject({ processed: 1, failed: 0 });
    expect(await k.storedEvents()).toEqual([]);
  });

  it("sweepUnownedPhotos#2 登録から残す期間を過ぎた、accepted のまま残った写真（登録または複製の途中で失敗したもの） / ジョブを実行する", async () => {
    const k = mediaKit();
    const withContent = await acceptedWithContent(k);
    const withoutContent = await acceptedOnly(k);
    k.passRetention();
    const report = await sweep(k);
    expect(report).toMatchObject({ processed: 2, failed: 0 });
    await k.expectNoPhoto(withContent);
    await k.expectNoPhoto(withoutContent);
    expect(k.storage.bucket.keys()).toEqual([]);
  });

  it("sweepUnownedPhotos#3 登録から残す期間を過ぎていない、持ち主のない stored の写真 / ジョブを実行する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photo = await k.register(alice);
    const before = await k.get(photo);
    k.clock.advance(60_000);
    await sweep(k);
    expect(await k.get(photo)).toEqual(before);
    await k.claim(photo, k.owner("listing"), alice);
    expect((await k.get(photo)).entity.stage).toBe("stored");
  });

  it("sweepUnownedPhotos#4 登録から残す期間を過ぎた、持ち主のある stored の写真 / ジョブを実行する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photo = await k.register(alice);
    await k.claim(photo, k.owner("place"), alice);
    const before = await k.get(photo);
    const content = await k.served(photo);
    k.passRetention();
    await sweep(k);
    expect(await k.get(photo)).toEqual(before);
    expect(await k.served(photo)).toEqual(content);
  });

  it("sweepUnownedPhotos#5 実体の削除で失敗し、discarded のまま残った写真。登録から残す期間を過ぎていない / ジョブを実行する", async () => {
    const k = mediaKit();
    const photo = await k.register(k.person());
    k.storage.fail("delete", photo);
    await expect(discardReleased(k.container, [photo])).rejects.toThrow();
    k.storage.heal();
    expect((await k.get(photo)).entity.stage).toBe("discarded");
    await sweep(k);
    await k.expectNoPhoto(photo);
  });

  it("sweepUnownedPhotos#6 掃除の対象が2枚。1枚目の PhotoStorage.delete が失敗する / ジョブを実行する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const first = await k.register(alice);
    k.clock.advance(1_000);
    const second = await k.register(alice);
    k.passRetention();
    k.storage.fail("delete", first);
    const report = await sweep(k);
    await k.expectNoPhoto(second);
    expect((await k.get(first)).entity.stage).toBe("discarded");
    // The run ended (the failed photo is not retried in it) with one failure.
    expect(report).toMatchObject({ processed: 1, failed: 1 });
  });

  it("sweepUnownedPhotos#7 上の実行の後。PhotoStorage.delete が成功するようになった / ジョブをもう一度実行する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const first = await k.register(alice);
    await k.register(alice);
    k.passRetention();
    k.storage.fail("delete", first);
    await sweep(k);
    k.storage.heal();
    const report = await sweep(k);
    await k.expectNoPhoto(first);
    expect(report).toMatchObject({ processed: 1, failed: 0 });
  });

  it("sweepUnownedPhotos#8 登録から残す期間を過ぎた、持ち主のない写真。ジョブがページを読んだ後、その写真を読み直す前に、その写真を載せた読みものの保存が確定する / ジョブがその写真を処理する", async () => {
    const k = mediaKit();
    const editor = await editorOf(k);
    const claimed = await k.register(editor);
    const other = await k.register(editor);
    k.passRetention();
    const articleId = k.newPhotoId();
    // Scope 1 reads the page; the article's save commits before scope 2 re-reads.
    k.uow.beforeCommitOf(1, () => saveArticle(k, editor, articleId, claimed));
    const report = await sweep(k);
    expect((await k.get(claimed)).entity).toMatchObject({
      stage: "stored",
      owner: { kind: "article", id: articleId },
    });
    expect(await k.served(claimed)).not.toBeNull();
    await k.expectNoPhoto(other);
    expect(report.failed).toBe(0);
  });

  it("sweepUnownedPhotos#9 登録から残す期間を過ぎた、持ち主のない写真。ジョブがその写真を読み直した後、破棄を確定する前に、その写真を載せた読みものの保存が確定する / ジョブが破棄を確定しようとする", async () => {
    const k = mediaKit();
    const editor = await editorOf(k);
    const claimed = await k.register(editor);
    k.clock.advance(1_000);
    const other = await k.register(editor);
    k.passRetention();
    const articleId = k.newPhotoId();
    // Scope 2 is the first photo's re-read and discard: the article's save
    // commits in between, so the discard's save conflicts.
    k.uow.beforeCommitOf(2, () => saveArticle(k, editor, articleId, claimed));
    const report = await sweep(k);
    expect(k.logger.byLevel("info")).toContainEqual(
      expect.objectContaining({ meta: { photoId: claimed } }),
    );
    expect((await k.get(claimed)).entity).toMatchObject({
      stage: "stored",
      owner: { kind: "article", id: articleId },
    });
    expect(await k.served(claimed)).not.toBeNull();
    await k.expectNoPhoto(other);
    expect(report.failed).toBe(0);
  });

  it("sweepUnownedPhotos#10 掃除の対象がない / ジョブを実行する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const owned = await k.register(alice);
    await k.claim(owned, k.owner("listing"), alice);
    const before = await k.get(owned);
    k.passRetention();
    const report = await sweep(k);
    expect(report).toEqual({
      processed: 0,
      failed: 0,
      skipped: 0,
      abandoned: false,
    });
    expect(await k.get(owned)).toEqual(before);
  });

  it("runs as the daily job with the run's time", async () => {
    const k = mediaKit();
    const photo = await k.register(k.person());
    k.passRetention();
    await sweepUnownedPhotosJob.run(k.container, k.clock.now());
    await k.expectNoPhoto(photo);
  });

  it("fails only a photo whose record cannot be restored and sweeps the rest, every run", async () => {
    const k = mediaKit();
    const alice = k.person();
    const corrupt = await k.register(alice);
    const photo = await k.register(alice);
    k.rawSql.exec(
      "UPDATE photo_assets SET registered_by = 'not-an-id' WHERE id = ?",
      corrupt,
    );
    k.passRetention();

    expect(await sweep(k)).toMatchObject({ processed: 1, failed: 1 });
    await k.expectNoPhoto(photo);
    expect(k.logger.byLevel("warn")).toMatchObject([
      { meta: { job: "sweepUnownedPhotos", target: corrupt } },
    ]);
    expect(await sweep(k)).toMatchObject({ processed: 0, failed: 1 });
  });

  it("drains more than one page of targets", async () => {
    const k = mediaKit();
    const alice = k.person();
    const photos: PhotoId[] = [];
    for (let i = 0; i < 105; i++) photos.push(await k.register(alice));
    k.passRetention();
    const report = await sweep(k);
    expect(report.processed).toBe(105);
    expect(k.storage.bucket.keys()).toEqual([]);
  });
});
