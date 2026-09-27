import { expectBusinessRuleError } from "@repo/core/adapters/do/__conformance__/assertions";
import { PhotoId } from "@repo/core/domain/common/ids";
import { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import { describe, expect, it } from "vitest";
import { duplicatePhotos } from "../duplicatePhotos";
import { sweepUnownedPhotos } from "../sweepUnownedPhotos";
import { type MediaKit, mediaKit } from "./kit";

type Actor = ReturnType<MediaKit["person"]>;

const duplicate = (k: MediaKit, actor: Actor, photoIds: readonly PhotoId[]) =>
  duplicatePhotos({ container: k.container, actor, input: { photoIds } });

/** A rejected application's photo, then its applicant's duplicate. */
async function reapplicationSetup() {
  const k = mediaKit();
  const applicant = k.person();
  const source = await k.register(applicant);
  const application = k.owner("application");
  await k.claim(source, application, applicant);
  const before = await k.get(source);
  k.clock.advance(24 * 60 * 60 * 1000);
  const duplicates = await duplicate(k, applicant, [source]);
  const copy = duplicates.get(source);
  if (copy === undefined) throw new Error("no duplicate");
  return { k, applicant, source, application, before, copy };
}

/** The ids the generator will mint next, without consuming them. */
function upcomingIds(k: MediaKit, count: number): readonly PhotoId[] {
  const ids = Array.from({ length: count }, () => k.idGenerator.next());
  k.idGenerator.reset(Number.parseInt((ids[0] ?? "").slice(-12), 16));
  return ids.map((id) => PhotoId.create(id));
}

/** How many of `ids` have a record. */
async function recordCount(k: MediaKit, ids: readonly PhotoId[]) {
  return k.uow.inner.run(
    async ({ photoAssetRepository }) =>
      (await photoAssetRepository.findByIds(ids)).length,
  );
}

describe("duplicatePhotos", () => {
  it("duplicatePhotos#1 掲載を持ち主とする stored の写真が2枚 / 2枚の PhotoId を渡して複製する", async () => {
    const k = mediaKit();
    const manager = k.person();
    const [a, b] = [await k.register(manager), await k.register(manager)];
    const listing = k.owner("listing");
    await k.claim(a, listing, manager);
    await k.claim(b, listing, manager);
    const duplicator = k.person();
    k.clock.advance(60_000);
    const duplicates = await duplicate(k, duplicator, [a, b]);
    expect([...duplicates.keys()].sort()).toEqual([a, b].sort());
    for (const [source, copy] of duplicates) {
      expect(copy).not.toBe(source);
      const original = (await k.get(source)).entity;
      expect((await k.get(copy)).entity).toEqual({
        id: copy,
        stage: "accepted",
        consentedAt: original.consentedAt,
        digest: original.digest,
        registeredBy: duplicator.accountId,
        registeredAt: k.clock.now(),
        version: 0,
      });
      expect(await k.served(copy)).toEqual(await k.served(source));
    }
  });

  it("duplicatePhotos#2 否認で終わった申請を持ち主とする stored の写真が1枚。申請者が複製を行う / その写真の PhotoId を渡して複製する", async () => {
    const { k, applicant, source, application, copy } =
      await reapplicationSetup();
    const original = (await k.get(source)).entity;
    const read = await k.get(copy);
    expect(read.entity).toMatchObject({
      consentedAt: original.consentedAt,
      registeredBy: applicant.accountId,
    });
    // `prepareReapplication` stores it; the resubmission claims it.
    const stored =
      read.entity.stage === "accepted"
        ? PhotoAsset.markStored(read.entity)
        : null;
    if (stored === null) throw new Error("expected an accepted duplicate");
    const reapplication = k.owner("application");
    expect(
      PhotoOwnership.claimAll([stored], [copy], reapplication, applicant),
    ).toMatchObject([{ owner: reapplication }]);
    expect(original).toMatchObject({ stage: "stored", owner: application });
  });

  it("duplicatePhotos#3 上の複製の後 / 元の写真を読む", async () => {
    const { k, source, before } = await reapplicationSetup();
    expect(await k.get(source)).toEqual(before);
    expect(await k.served(source)).not.toBeNull();
  });

  it("duplicatePhotos#4 上の複製の後 / 元の写真の実体を削除する", async () => {
    const { k, source, copy } = await reapplicationSetup();
    const content = await k.served(copy);
    await k.container.photoStorage.delete(source);
    expect(await k.served(source)).toBeNull();
    expect(await k.served(copy)).toEqual(content);
  });

  it("duplicatePhotos#5 写真のない掲載の複製（空の一覧） / 空の一覧を渡して複製する", async () => {
    const k = mediaKit();
    const duplicates = await duplicate(k, k.person(), []);
    expect(duplicates.size).toBe(0);
    expect(
      await k.uow.inner.run(({ photoAssetRepository }) =>
        photoAssetRepository.findPageSweepable(new Date(8.64e15), {
          page: 1,
          limit: 10,
        }),
      ),
    ).toEqual({ items: [], count: 0 });
  });

  it("duplicatePhotos#6 stored の写真が1枚と、記録のない PhotoId が1つ / 2つを渡して複製する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const present = await k.register(alice);
    const missing = PhotoId.create(k.newPhotoId());
    const wouldBe = upcomingIds(k, 2);
    await expectBusinessRuleError(
      duplicate(k, alice, [present, missing]),
      MediaErrorCode.DuplicateSourceUnavailable,
    );
    expect(await recordCount(k, wouldBe)).toBe(0);
    for (const id of wouldBe) expect(await k.served(id)).toBeNull();
    expect(k.storage.bucket.keys()).toHaveLength(1);
  });

  it("duplicatePhotos#7 stored の写真が1枚と、discarded の写真が1枚 / 2枚を渡して複製する", async () => {
    const k = mediaKit();
    const alice = k.person();
    const present = await k.register(alice);
    const discarded = await k.register(alice);
    await k.discardOnly(discarded);
    const wouldBe = upcomingIds(k, 2);
    await expectBusinessRuleError(
      duplicate(k, alice, [present, discarded]),
      MediaErrorCode.DuplicateSourceUnavailable,
    );
    expect(await recordCount(k, wouldBe)).toBe(0);
    for (const id of wouldBe) expect(await k.served(id)).toBeNull();
    expect(k.storage.bucket.keys()).toHaveLength(2);
  });

  it("duplicatePhotos#8 複製が成立したが、呼び出したユースケースが持ち主を設定しなかった / PhotoPolicy.unownedRetentionMs を過ぎてから sweepUnownedPhotos を実行する", async () => {
    const k = mediaKit();
    const manager = k.person();
    const source = await k.register(manager);
    await k.claim(source, k.owner("listing"), manager);
    const copy = (await duplicate(k, manager, [source])).get(source);
    if (copy === undefined) throw new Error("no duplicate");
    k.passRetention();
    await sweepUnownedPhotos({ container: k.container, now: k.clock.now() });
    await k.expectNoPhoto(copy);
    expect((await k.get(source)).entity.stage).toBe("stored");
    expect(await k.served(source)).not.toBeNull();
  });

  it("duplicates more than 100 photos across id batches", async () => {
    const k = mediaKit();
    const alice = k.person();
    const sources: PhotoId[] = [];
    for (let i = 0; i < 101; i++) sources.push(await k.register(alice));
    const duplicates = await duplicate(k, alice, sources);
    expect(duplicates.size).toBe(101);
    expect(await recordCount(k, [...duplicates.values()].slice(0, 100))).toBe(
      100,
    );
  });

  it("leaves accepted duplicates for the sweep when a copy fails", async () => {
    const k = mediaKit();
    const alice = k.person();
    const source = await k.register(alice);
    k.storage.fail("copy", source);
    const [copy] = upcomingIds(k, 1);
    if (copy === undefined) throw new Error("no id");
    await expect(duplicate(k, alice, [source])).rejects.toThrow();
    expect((await k.get(copy)).entity.stage).toBe("accepted");
    k.storage.heal();
    k.passRetention();
    await sweepUnownedPhotos({ container: k.container, now: k.clock.now() });
    await k.expectNoPhoto(copy);
  });
});
