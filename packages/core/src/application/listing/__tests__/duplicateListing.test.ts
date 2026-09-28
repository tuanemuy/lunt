import { ListingId, type PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import type { GeneratedId } from "../../ports/idGenerator";
import { deleteListing } from "../deleteListing";
import { duplicateListing } from "../duplicateListing";
import { updateListing } from "../updateListing";
import { type ListingKit, listingKit, period } from "./kit";

/** The container with `PhotoStorage.copy` recorded (destination ids). */
function spyCopies(container: RequestContainer) {
  const copies: PhotoId[] = [];
  const storage = container.photoStorage;
  return {
    copies,
    container: {
      ...container,
      photoStorage: {
        put: (id, file) => storage.put(id, file),
        delete: (id) => storage.delete(id),
        displayRefs: (ids) => storage.displayRefs(ids),
        copy: async (source, destination) => {
          copies.push(destination);
          await storage.copy(source, destination);
        },
      },
    } satisfies RequestContainer,
  };
}

/** A container whose first unit of work, once committed, is followed by `hook`. */
function afterFirstRun(
  container: RequestContainer,
  hook: () => Promise<unknown>,
): RequestContainer {
  let fired = false;
  return {
    ...container,
    unitOfWorkProvider: {
      run: async (fn) => {
        const result = await container.unitOfWorkProvider.run(fn);
        if (!fired) {
          fired = true;
          await hook();
        }
        return result;
      },
    },
  };
}

/** An existing id as the caller-minted id a resend would carry. */
function generated(k: ListingKit, id: string): GeneratedId {
  const parsed = k.t.idGenerator.parse(id);
  if (parsed === null) throw new Error(`not a generated id: ${id}`);
  return parsed;
}

const duplicator =
  (k: ListingKit) =>
  (
    who: Person,
    sourceId: ListingId,
    listingId: GeneratedId = k.newId(),
    container: RequestContainer = k.container,
  ) =>
    duplicateListing({
      container,
      actor: who.actor,
      input: { sourceId, listingId },
    });

describe("duplicateListing", () => {
  it("duplicateListing#1 店舗 A の公開中の掲載に、名称・説明・カテゴリー・写真2枚（1枚目に見せる範囲）・提供期間がある。操作する人は店舗 A の店舗管理者 / 新しい ListingId を指定して複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const framing = { x: 0, y: 0.25, width: 1, height: 0.5 };
    const buy = await k.category("買う");
    const source = await k.published(m, a, {
      name: "りんご飴",
      description: "甘い",
      categoryId: buy,
      photos: [{ photoId: p1, framing }, p2],
      offering: period("2026-07-01", "2026-08-31"),
    });
    const sourceBefore = await k.stored(source.id);
    const mark = await k.mark();
    const copy = await duplicator(k)(m, source.id);
    const stored = (await k.stored(copy.id)).entity;
    expect(stored.placeId).toBe(a);
    expect(stored.publication.status).toBe("draft");
    expect(stored.content).toMatchObject({
      name: "りんご飴",
      description: "甘い",
      categoryId: buy,
      offering: { kind: "none" },
    });
    const newIds = PhotoSet.photoIds(stored.content.photos);
    expect(newIds).toHaveLength(2);
    expect(newIds).not.toContain(p1);
    expect(newIds).not.toContain(p2);
    expect(stored.content.photos.items.map((p) => p.framing)).toEqual([
      framing,
      null,
    ]);
    for (const id of newIds) {
      const photo = await k.run(({ photoAssetRepository }) =>
        photoAssetRepository.findById(id),
      );
      expect(photo?.entity.stage).toBe("stored");
      expect(await k.photoOwner(id)).toEqual({ kind: "listing", id: copy.id });
    }
    expect((await k.stored(source.id)).entity).toEqual(sourceBefore.entity);
    expect(await k.photoOwner(p1)).toEqual({ kind: "listing", id: source.id });
    expect(await k.since(mark)).toEqual([]);
  });

  it("duplicateListing#2 店舗 A に、下書き、一時非公開、提供終了の掲載がある / それぞれを複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const unpublished = await k.published(m, a);
    await k.unpublish(m, unpublished.id);
    const ended = await k.published(m, a);
    await k.end(m, ended.id);
    for (const source of [draft, unpublished, ended]) {
      const copy = await duplicator(k)(m, source.id);
      const stored = (await k.stored(copy.id)).entity;
      expect(stored.placeId).toBe(a);
      expect(stored.publication.status).toBe("draft");
    }
  });

  it("duplicateListing#3 店舗 A の下書きに写真がない / 複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { photos: [] });
    const spy = spyCopies(k.container);
    const copy = await duplicator(k)(m, draft.id, k.newId(), spy.container);
    expect((await k.stored(copy.id)).entity.content.photos.items).toEqual([]);
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#4 元の掲載に保存されたカテゴリーが廃止済み / 複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    const source = await k.published(m, a, { categoryId: experience });
    await k.retireCategory(experience, see);
    const copy = await duplicator(k)(m, source.id);
    expect((await k.stored(copy.id)).entity.content.categoryId).toBe(see);
  });

  it("duplicateListing#5 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の掲載を複製する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const source = await k.published(op, b);
    const copy = await duplicator(k)(op, source.id);
    expect((await k.stored(copy.id)).entity.placeId).toBe(b);
  });

  it("duplicateListing#6 店舗 A の公開中の掲載が、運営による非公開になっている。操作する人は店舗 A の店舗管理者 / 複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const source = await k.published(m, a);
    await k.suspend(await k.operator(), source.id);
    const copy = await duplicator(k)(m, source.id);
    const stored = (await k.stored(copy.id)).entity;
    expect(stored.placeId).toBe(a);
    expect(stored.suspension).toEqual({ suspended: false });
    expect((await k.stored(source.id)).entity.suspension).toEqual({
      suspended: true,
    });
  });

  it("duplicateListing#7 元にする掲載を、複製の操作の前に別の店舗管理者が削除している / 複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const source = await k.published(m, a);
    await k.remove(await k.manager(a), source.id);
    const spy = spyCopies(k.container);
    const id = k.newId();
    await expectCode(
      duplicator(k)(m, source.id, id, spy.container),
      NotFoundError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#8 複製の操作が元の掲載を読んだ後、写真の複製が終わる前に、別の店舗管理者が元の掲載を削除した（元の写真はまだ破棄されていない） / 複製を続ける", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const source = await k.published(m, a, { name: "元の掲載" });
    const deleting = afterFirstRun(k.container, () =>
      k.remove(other, source.id),
    );
    const copy = await duplicator(k)(m, source.id, k.newId(), deleting);
    expect((await k.stored(copy.id)).entity.content.name).toBe("元の掲載");
    expect(await k.findListing(source.id)).toBeNull();
  });

  it("answers a resend to a deleted duplicate's id with ConflictError and copies no photo", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1] = await k.photos(m, 1);
    if (p1 === undefined) throw new Error("photos");
    const source = await k.published(m, a, { photos: [p1] });
    const x = k.newId();
    const copy = await duplicator(k)(m, source.id, x);
    await deleteListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: copy.id },
    });
    const spy = spyCopies(k.container);

    await expectCode(
      duplicator(k)(m, source.id, x, spy.container),
      ConflictError,
    );
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#9 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の掲載を複製する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const source = await k.published(m, a);
    const spy = spyCopies(k.container);
    const id = k.newId();
    await expectCode(
      duplicator(k)(await k.person(), source.id, id, spy.container),
      ForbiddenError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#10 同じ元の掲載と同じ新しい ListingId の複製が、すでに成立している / 同じ要求を送り直す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const source = await k.published(m, a);
    const id = k.newId();
    const first = await duplicator(k)(m, source.id, id);
    const before = await k.stored(first.id);
    const spy = spyCopies(k.container);
    const again = await duplicator(k)(m, source.id, id, spy.container);
    expect(again.id).toBe(first.id);
    const after = await k.stored(first.id);
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(spy.copies).toEqual([]);
    const list = await k.run(({ listingRepository }) =>
      listingRepository.findPageByPlace(
        a,
        { publication: "draft", phase: null },
        LocalDate.parse("2026-07-10"),
        { page: 1, limit: 10 },
      ),
    );
    expect(list.count).toBe(1);
  });

  it("duplicateListing#11 複製が成立した後に、店舗管理者が新しい下書きの名称を変えて保存している / 同じ要求を送り直す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const source = await k.published(m, a);
    const id = k.newId();
    const copy = await duplicator(k)(m, source.id, id);
    await k.saveName(m, copy.id, "変えた名称");
    const spy = spyCopies(k.container);
    await expectCode(
      duplicator(k)(m, source.id, id, spy.container),
      ConflictError,
    );
    expect((await k.stored(copy.id)).entity.content.name).toBe("変えた名称");
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#12 指定した新しい ListingId と同じ ID の、別の店舗の掲載がすでにある / 複製する", async () => {
    const k = await listingKit();
    const [a, c] = [await k.place(), await k.place()];
    const m = await k.manager(a);
    const mc = await k.manager(c);
    const source = await k.published(m, a);
    const taken = await k.draft(mc, c, { name: "掲載" });
    const takenBefore = await k.stored(taken.id);
    const sourceBefore = await k.stored(source.id);
    const spy = spyCopies(k.container);
    await expectCode(
      duplicator(k)(m, source.id, generated(k, taken.id), spy.container),
      ConflictError,
    );
    expect((await k.stored(taken.id)).entity).toEqual(takenBefore.entity);
    expect((await k.stored(source.id)).entity).toEqual(sourceBefore.entity);
    expect(spy.copies).toEqual([]);
  });

  it("duplicateListing#13 複製の操作が元の掲載を読んだ後、写真の複製の前に、別の店舗管理者が元の掲載から写真を外して保存し、外した写真が破棄された / 複製を続ける", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const [kept, removed] = await k.photos(m, 2);
    if (kept === undefined || removed === undefined) throw new Error("photos");
    const source = await k.published(m, a, { photos: [kept, removed] });
    const discarding = afterFirstRun(k.container, async () => {
      const { entity } = await k.stored(source.id);
      await updateListing({
        container: k.container,
        actor: other.actor,
        input: {
          listingId: source.id,
          version: entity.version,
          content: k.content({ photos: [kept] }),
        },
      });
      await k.run(async ({ photoAssetRepository }) => {
        const found = await photoAssetRepository.findById(removed);
        if (found === null || found.entity.stage === "discarded") {
          throw new Error("photo");
        }
        await photoAssetRepository.save(
          PhotoAsset.discard(found.entity),
          found.expectedVersion,
        );
      });
    });
    const spy = spyCopies(discarding);
    const id = k.newId();
    await expectCode(
      duplicator(k)(m, source.id, id, spy.container),
      BusinessRuleError,
      "MEDIA_DUPLICATE_SOURCE_UNAVAILABLE",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(spy.copies).toEqual([]);
  });
});
