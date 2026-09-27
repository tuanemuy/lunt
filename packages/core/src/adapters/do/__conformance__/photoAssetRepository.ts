import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { Actor } from "@repo/core/domain/common/actor";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import {
  AccountId,
  ApplicationId,
  PhotoId,
} from "@repo/core/domain/common/ids";
import type { PaginationResult } from "@repo/core/domain/common/pagination";
import { ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import {
  type AcceptedPhoto,
  PhotoAsset,
  type StoredPhoto,
} from "@repo/core/domain/media/photoAsset";
import { PhotoConsent } from "@repo/core/domain/media/photoConsent";
import { PhotoFormat } from "@repo/core/domain/media/photoFile";
import { PhotoIntake } from "@repo/core/domain/media/photoIntake";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const T = new Date("2026-09-28T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(T.getTime() + hours * HOUR);

/** The sweep deadline the findPageSweepable cases read with. */
const B = at(0);

type Kit = Readonly<{
  h: ConformanceHarness;
  alice: Actor;
  /** An accepted photo registered at `registeredAt` (default one hour before B). */
  accepted(registeredAt?: Date): AcceptedPhoto;
  ownerOf(kind: PhotoOwnerRef["kind"]): PhotoOwnerRef;
  photoId(): PhotoId;
}>;

async function kit(makeHarness: HarnessFactory): Promise<Kit> {
  const h = await makeHarness();
  const ids = new FakeIdGenerator();
  const alice: Actor = { accountId: AccountId.create(ids.next()) };
  let n = 0;
  return {
    h,
    alice,
    photoId: () => PhotoId.create(ids.next()),
    ownerOf: (kind) => PhotoOwnerRef.create(kind, ids.next()),
    accepted: (registeredAt = at(-1)) => {
      n += 1;
      return PhotoAsset.register(
        {
          id: PhotoId.create(ids.next()),
          registrant: alice,
          consent: PhotoConsent.agree({ agreed: true }, registeredAt),
          file: PhotoIntake.accept(new TextEncoder().encode(`photo ${n}`), {
            kind: "photo",
            format: PhotoFormat.create("image/png"),
          }),
        },
        registeredAt,
      );
    },
  };
}

async function insert(
  h: ConformanceHarness,
  ...photos: readonly PhotoAsset[]
): Promise<void> {
  await h.uow.run(async ({ photoAssetRepository }) => {
    for (const photo of photos) await photoAssetRepository.insert(photo);
  });
}

function find(
  h: ConformanceHarness,
  id: PhotoId,
): Promise<Versioned<PhotoAsset> | null> {
  return h.uow.run(({ photoAssetRepository }) =>
    photoAssetRepository.findById(id),
  );
}

async function get(
  h: ConformanceHarness,
  id: PhotoId,
): Promise<Versioned<PhotoAsset>> {
  const found = await find(h, id);
  if (found === null) throw new Error(`no photo ${id}`);
  return found;
}

function save(
  h: ConformanceHarness,
  photo: PhotoAsset,
  expectedVersion: ExpectedVersion<PhotoAsset>,
): Promise<void> {
  return h.uow.run(({ photoAssetRepository }) =>
    photoAssetRepository.save(photo, expectedVersion),
  );
}

function remove(
  h: ConformanceHarness,
  id: PhotoId,
  expectedVersion: ExpectedVersion<PhotoAsset>,
): Promise<void> {
  return h.uow.run(({ photoAssetRepository }) =>
    photoAssetRepository.delete(id, expectedVersion),
  );
}

function findByIds(
  h: ConformanceHarness,
  ids: readonly PhotoId[],
): Promise<readonly Versioned<PhotoAsset>[]> {
  return h.uow.run(({ photoAssetRepository }) =>
    photoAssetRepository.findByIds(ids),
  );
}

function sweepable(
  h: ConformanceHarness,
  page = 1,
  limit = 10,
): Promise<PaginationResult<Versioned<PhotoAsset>>> {
  return h.uow.run(({ photoAssetRepository }) =>
    photoAssetRepository.findPageSweepable(B, { page, limit }),
  );
}

const idsOf = (result: PaginationResult<Versioned<PhotoAsset>>) =>
  result.items.map((item) => item.entity.id);

/** Inserts `photo`, then stores it (and claims it for `owner` when given). */
async function stored(
  k: Kit,
  photo: AcceptedPhoto,
  owner?: PhotoOwnerRef,
): Promise<StoredPhoto> {
  await insert(k.h, photo);
  let current = PhotoAsset.markStored(photo);
  await save(k.h, current, (await get(k.h, photo.id)).expectedVersion);
  if (owner !== undefined) {
    current = PhotoAsset.claim(current, owner, k.alice);
    await save(k.h, current, (await get(k.h, photo.id)).expectedVersion);
  }
  return current;
}

async function discarded(k: Kit, photo: AcceptedPhoto): Promise<PhotoAsset> {
  await insert(k.h, photo);
  const next = PhotoAsset.discard(photo);
  await save(k.h, next, (await get(k.h, photo.id)).expectedVersion);
  return next;
}

async function deleted(k: Kit, id: PhotoId): Promise<void> {
  await remove(k.h, id, (await get(k.h, id)).expectedVersion);
}

/**
 * The `PhotoAssetRepository` contract (`spec/testcases/ports/photoAssetRepository.md`),
 * run against every backend.
 */
export function describePhotoAssetRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("PhotoAssetRepository contract", () => {
    describe("insert・findById・save・delete", () => {
      it("photoAssetRepository#1 写真がない / accepted の写真を insert し、findById する", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted();
        await insert(k.h, photo);
        const found = await get(k.h, photo.id);
        expect(found.entity).toEqual(photo);
        expect(found.expectedVersion).toBe(photo.version);
      });

      it("photoAssetRepository#2 写真がない / 存在しない PhotoId で findById する", async () => {
        const k = await kit(makeHarness);
        expect(await find(k.h, k.photoId())).toBeNull();
      });

      it("photoAssetRepository#3 insert した accepted の写真 / findById の expectedVersion で、markStored の結果を save し、findById する", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted();
        await insert(k.h, photo);
        const read = await get(k.h, photo.id);
        await save(k.h, PhotoAsset.markStored(photo), read.expectedVersion);
        expect((await get(k.h, photo.id)).entity).toMatchObject({
          stage: "stored",
          owner: null,
        });
      });

      it("photoAssetRepository#4 持ち主のない stored の写真 / claim の結果を save し、findById する", async () => {
        const k = await kit(makeHarness);
        for (const kind of PhotoOwnerRef.kinds) {
          const owner = k.ownerOf(kind);
          const photo = await stored(k, k.accepted(), owner);
          const found = (await get(k.h, photo.id)).entity;
          expect(found.stage === "stored" ? found.owner : null).toEqual(owner);
        }
      });

      it("photoAssetRepository#5 申請を持ち主とする stored の写真 / transfer の結果を save し、findById する", async () => {
        const k = await kit(makeHarness);
        const application = {
          kind: "application",
          id: ApplicationId.create(k.photoId()),
        } as const;
        const photo = await stored(k, k.accepted(), application);
        const place = ContentRef.create("place", k.photoId());
        await save(
          k.h,
          PhotoAsset.transfer(photo, application, place),
          (await get(k.h, photo.id)).expectedVersion,
        );
        expect((await get(k.h, photo.id)).entity).toMatchObject({
          stage: "stored",
          owner: place,
        });
      });

      it("photoAssetRepository#6 stored の写真 / discard の結果を save し、findById する", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted(), k.ownerOf("listing"));
        await save(
          k.h,
          PhotoAsset.discard(photo),
          (await get(k.h, photo.id)).expectedVersion,
        );
        const found = (await get(k.h, photo.id)).entity;
        expect(found.stage).toBe("discarded");
        expect("owner" in found).toBe(false);
      });

      it("photoAssetRepository#7 insert した写真 / 同じ PhotoId の写真を insert する", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted();
        await insert(k.h, photo);
        const other = { ...k.accepted(at(-2)), id: photo.id };
        await expect(insert(k.h, other)).rejects.toBeInstanceOf(ConflictError);
        expect((await get(k.h, photo.id)).entity).toEqual(photo);
      });

      it("photoAssetRepository#8 insert した写真 / save の後に findById する", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted();
        await stored(k, photo, k.ownerOf("article"));
        expect((await get(k.h, photo.id)).entity).toMatchObject({
          registeredBy: photo.registeredBy,
          consentedAt: photo.consentedAt,
          digest: photo.digest,
          registeredAt: photo.registeredAt,
        });
      });

      it("photoAssetRepository#9 discarded の写真 / findById の expectedVersion で delete し、findById する", async () => {
        const k = await kit(makeHarness);
        const photo = await discarded(k, k.accepted());
        await deleted(k, photo.id);
        expect(await find(k.h, photo.id)).toBeNull();
      });

      it("photoAssetRepository#10 写真 A がある。一度も insert していない PhotoId の写真 Z / A の findById で得た expectedVersion で、Z を save する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        const Z = k.accepted();
        await insert(k.h, A);
        const read = await get(k.h, A.id);
        await expect(
          save(k.h, PhotoAsset.markStored(Z), read.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect((await get(k.h, A.id)).entity).toEqual(A);
      });

      it("photoAssetRepository#11 写真 A がある / A の findById で得た expectedVersion で、一度も insert していない PhotoId を delete する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        const read = await get(k.h, A.id);
        await expect(
          remove(k.h, k.photoId(), read.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await find(k.h, A.id)).not.toBeNull();
      });

      it("photoAssetRepository#12 写真 A を delete した / delete の前に得た expectedVersion で、A を save する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        const read = await get(k.h, A.id);
        await remove(k.h, A.id, read.expectedVersion);
        await expect(
          save(k.h, PhotoAsset.markStored(A), read.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await find(k.h, A.id)).toBeNull();
      });

      it("photoAssetRepository#13 写真 A を delete した / delete の前に得た expectedVersion で、A をもう一度 delete する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        const read = await get(k.h, A.id);
        await remove(k.h, A.id, read.expectedVersion);
        await expect(
          remove(k.h, A.id, read.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("photoAssetRepository#14 写真 A を insert し、discard を save して delete した / A と同じ PhotoId の accepted の写真を insert する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await discarded(k, A);
        await deleted(k, A.id);
        await expect(insert(k.h, A)).rejects.toBeInstanceOf(ConflictError);
        expect(await find(k.h, A.id)).toBeNull();
      });
    });

    describe("楽観ロック", () => {
      it("photoAssetRepository#15 同じ写真を2回 findById し、同じ expectedVersion を2つ得た / 1つ目で save を確定し、2つ目で save する", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const first = await get(k.h, photo.id);
        const second = await get(k.h, photo.id);
        const owner = k.ownerOf("place");
        await save(
          k.h,
          PhotoAsset.claim(photo, owner, k.alice),
          first.expectedVersion,
        );
        await expect(
          save(k.h, PhotoAsset.discard(photo), second.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await get(k.h, photo.id)).entity).toMatchObject({
          stage: "stored",
          owner,
        });
      });

      it("photoAssetRepository#16 同じ写真の同じ expectedVersion を2つ得た / 1つ目で save を確定し、2つ目で delete する", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const first = await get(k.h, photo.id);
        const second = await get(k.h, photo.id);
        await save(k.h, PhotoAsset.discard(photo), first.expectedVersion);
        await expect(
          remove(k.h, photo.id, second.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await find(k.h, photo.id)).not.toBeNull();
      });

      it("photoAssetRepository#17 持ち主のない stored の写真を、持ち主の設定と掃除が同じ版で読んだ / 持ち主の設定の save（claim）を先に確定し、掃除の save（discard）を後に確定する", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const byOwner = await get(k.h, photo.id);
        const bySweep = await get(k.h, photo.id);
        const owner = k.ownerOf("listing");
        await save(
          k.h,
          PhotoAsset.claim(byOwner.entity, owner, k.alice),
          byOwner.expectedVersion,
        );
        await expect(
          save(k.h, PhotoAsset.discard(photo), bySweep.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await get(k.h, photo.id)).entity).toMatchObject({
          stage: "stored",
          owner,
        });
      });

      it("photoAssetRepository#18 上と同じ / 掃除の save（discard）を先に確定し、持ち主の設定の save（claim）を後に確定する", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const byOwner = await get(k.h, photo.id);
        const bySweep = await get(k.h, photo.id);
        await save(k.h, PhotoAsset.discard(photo), bySweep.expectedVersion);
        await expect(
          save(
            k.h,
            PhotoAsset.claim(byOwner.entity, k.ownerOf("listing"), k.alice),
            byOwner.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await get(k.h, photo.id)).entity.stage).toBe("discarded");
      });

      it("photoAssetRepository#19 同じ写真の同じ expectedVersion で、2つの save を同時に実行する / 両方の完了を待つ", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const bothRead = barrier(2);
        const attempt = (change: (p: PhotoAsset) => PhotoAsset) =>
          k.h.uow.run(async ({ photoAssetRepository }) => {
            const read = await photoAssetRepository.findById(photo.id);
            if (read === null) throw new Error("missing");
            await bothRead();
            await photoAssetRepository.save(
              change(read.entity),
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([
          attempt((p) => PhotoAsset.claim(p, k.ownerOf("place"), k.alice)),
          attempt((p) => (p.stage === "discarded" ? p : PhotoAsset.discard(p))),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await get(k.h, photo.id)).expectedVersion).toBe(
          photo.version + 1,
        );
      });
    });

    describe("findByIds", () => {
      it("photoAssetRepository#20 写真 A・B・C がある / A と C の ID で読む", async () => {
        const k = await kit(makeHarness);
        const [A, B_, C] = [k.accepted(), k.accepted(), k.accepted()];
        await insert(k.h, A, B_, C);
        const found = await findByIds(k.h, [A.id, C.id]);
        expect(found.map((f) => f.entity.id).sort()).toEqual(
          [A.id, C.id].sort(),
        );
        for (const f of found) expect(f.expectedVersion).toBe(0);
      });

      it("photoAssetRepository#21 写真 A がある / A の ID と、存在しない ID で読む", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        const found = await findByIds(k.h, [A.id, k.photoId()]);
        expect(found.map((f) => f.entity)).toEqual([A]);
      });

      it("photoAssetRepository#22 写真 A がある / 存在しない ID だけで読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, k.accepted());
        expect(await findByIds(k.h, [k.photoId()])).toEqual([]);
      });

      it("photoAssetRepository#23 写真 A がある / 空の一覧で読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, k.accepted());
        expect(await findByIds(k.h, [])).toEqual([]);
      });

      it("photoAssetRepository#24 写真 A を delete した / A の ID で読む", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        await deleted(k, A.id);
        expect(await findByIds(k.h, [A.id])).toEqual([]);
      });

      it("photoAssetRepository#25 accepted・stored・discarded の写真が1枚ずつある / 3つの ID で読む", async () => {
        const k = await kit(makeHarness);
        const a = k.accepted();
        await insert(k.h, a);
        const s = await stored(k, k.accepted());
        const d = await discarded(k, k.accepted());
        const found = await findByIds(k.h, [a.id, s.id, d.id]);
        const stages = new Map(found.map((f) => [f.entity.id, f.entity.stage]));
        expect(stages).toEqual(
          new Map([
            [a.id, "accepted"],
            [s.id, "stored"],
            [d.id, "discarded"],
          ]),
        );
      });

      it("photoAssetRepository#26 写真が100枚ある / 100件の ID で読む", async () => {
        const k = await kit(makeHarness);
        const photos = Array.from({ length: 100 }, () => k.accepted());
        await insert(k.h, ...photos);
        const found = await findByIds(
          k.h,
          photos.map((p) => p.id),
        );
        expect(found).toHaveLength(100);
      });

      it("photoAssetRepository#27 写真がある / 101件の ID で読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, k.accepted());
        await expectBusinessRuleError(
          findByIds(
            k.h,
            Array.from({ length: 101 }, () => k.photoId()),
          ),
          CommonErrorCode.InvalidInput,
        );
      });

      it("photoAssetRepository#28 findByIds で得た expectedVersion / その版で save する", async () => {
        const k = await kit(makeHarness);
        const A = k.accepted();
        await insert(k.h, A);
        const [read] = await findByIds(k.h, [A.id]);
        if (read === undefined) throw new Error("missing");
        await save(k.h, PhotoAsset.markStored(A), read.expectedVersion);
        expect((await get(k.h, A.id)).entity.stage).toBe("stored");
      });
    });

    describe("findPageSweepable", () => {
      it("photoAssetRepository#29 registeredAt が B より前の accepted の写真 / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted(at(-1));
        await insert(k.h, photo);
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
      });

      it("photoAssetRepository#30 registeredAt が B より前の、持ち主のない stored の写真 / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted(at(-1)));
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
      });

      it("photoAssetRepository#31 registeredAt が B より前の、持ち主のある stored の写真 / 読む", async () => {
        const k = await kit(makeHarness);
        await stored(k, k.accepted(at(-1)), k.ownerOf("listing"));
        expect(await sweepable(k.h)).toEqual({ items: [], count: 0 });
      });

      it("photoAssetRepository#32 registeredAt が B と同じ accepted の写真と、B より後の持ち主のない stored の写真 / 読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, k.accepted(B));
        await stored(k, k.accepted(at(1)));
        expect(await sweepable(k.h)).toEqual({ items: [], count: 0 });
      });

      it("photoAssetRepository#33 registeredAt が B より後の discarded の写真 / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = await discarded(k, k.accepted(at(1)));
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
      });

      it("photoAssetRepository#34 持ち主を持っていた stored の写真を discard して save した / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted(at(1)), k.ownerOf("place"));
        await save(
          k.h,
          PhotoAsset.discard(photo),
          (await get(k.h, photo.id)).expectedVersion,
        );
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
      });

      it("photoAssetRepository#35 B より前の持ち主のない stored の写真に、claim を save した / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted(at(-1)));
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
        await save(
          k.h,
          PhotoAsset.claim(photo, k.ownerOf("listing"), k.alice),
          (await get(k.h, photo.id)).expectedVersion,
        );
        expect(await sweepable(k.h)).toEqual({ items: [], count: 0 });
      });

      it("photoAssetRepository#36 掃除の対象の写真を delete した / 読む", async () => {
        const k = await kit(makeHarness);
        const photo = await discarded(k, k.accepted(at(-1)));
        await deleted(k, photo.id);
        expect(await sweepable(k.h)).toEqual({ items: [], count: 0 });
      });

      it("photoAssetRepository#37 対象の写真が3枚。registeredAt は T1 < T2 < T3 / 読む", async () => {
        const k = await kit(makeHarness);
        const t3 = k.accepted(at(-1));
        const t1 = k.accepted(at(-3));
        const t2 = k.accepted(at(-2));
        await insert(k.h, t3, t1, t2);
        expect(idsOf(await sweepable(k.h))).toEqual([t1.id, t2.id, t3.id]);
      });

      it("photoAssetRepository#38 対象の写真が2枚。registeredAt が同じ / 読む", async () => {
        const k = await kit(makeHarness);
        const first = k.accepted(at(-1));
        const second = k.accepted(at(-1));
        await insert(k.h, second, first);
        const expected = [first.id, second.id].sort((a, b) =>
          a < b ? -1 : a > b ? 1 : 0,
        );
        expect(idsOf(await sweepable(k.h))).toEqual(expected);
      });

      it("photoAssetRepository#39 返された写真 / 返された expectedVersion で save する", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted(at(-1));
        await insert(k.h, photo);
        const [read] = (await sweepable(k.h)).items;
        if (read === undefined) throw new Error("missing");
        await save(k.h, PhotoAsset.discard(photo), read.expectedVersion);
        expect((await get(k.h, photo.id)).entity.stage).toBe("discarded");
      });

      it("photoAssetRepository#40 対象が0件 / page: 1, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        expect(await sweepable(k.h, 1, 10)).toEqual({ items: [], count: 0 });
      });

      it("photoAssetRepository#41 対象が1件 / page: 1, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, k.accepted());
        const result = await sweepable(k.h, 1, 10);
        expect(result.items).toHaveLength(1);
        expect(result.count).toBe(1);
      });

      const targets = (k: Kit, count: number): readonly AcceptedPhoto[] =>
        Array.from({ length: count }, (_, i) => k.accepted(at(-100 + i)));

      it("photoAssetRepository#42 対象が10件 / page: 1, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, ...targets(k, 10));
        const result = await sweepable(k.h, 1, 10);
        expect(result.items).toHaveLength(10);
        expect(result.count).toBe(10);
      });

      it("photoAssetRepository#43 対象が10件 / page: 2, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        await insert(k.h, ...targets(k, 10));
        expect(await sweepable(k.h, 2, 10)).toEqual({ items: [], count: 10 });
      });

      it("photoAssetRepository#44 対象が11件 / page: 1, limit: 10 と page: 2, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        const photos = targets(k, 11);
        await insert(k.h, ...photos);
        const first = await sweepable(k.h, 1, 10);
        const second = await sweepable(k.h, 2, 10);
        expect([...idsOf(first), ...idsOf(second)]).toEqual(
          photos.map((p) => p.id),
        );
        expect(idsOf(first)).toHaveLength(10);
        expect(first.count).toBe(11);
        expect(second.count).toBe(11);
      });

      it("photoAssetRepository#45 対象が11件 / page: 1, limit: 10 の10件を delete し、もう一度 page: 1, limit: 10 で読む", async () => {
        const k = await kit(makeHarness);
        const photos = targets(k, 11);
        await insert(k.h, ...photos);
        const first = await sweepable(k.h, 1, 10);
        await k.h.uow.run(async ({ photoAssetRepository }) => {
          for (const item of first.items) {
            await photoAssetRepository.delete(
              item.entity.id,
              item.expectedVersion,
            );
          }
        });
        const again = await sweepable(k.h, 1, 10);
        expect(idsOf(again)).toEqual([photos[10]?.id]);
        expect(again.count).toBe(1);
      });

      it("photoAssetRepository#46 対象と対象でない写真が混ざっている / 読む", async () => {
        const k = await kit(makeHarness);
        const target = k.accepted(at(-1));
        await insert(k.h, target);
        await stored(k, k.accepted(at(-1)), k.ownerOf("region"));
        await insert(k.h, k.accepted(at(2)));
        const alsoTarget = await discarded(k, k.accepted(at(3)));
        const result = await sweepable(k.h);
        expect(idsOf(result)).toEqual([target.id, alsoTarget.id]);
        expect(result.count).toBe(2);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("photoAssetRepository#47 UnitOfWork の中で写真を insert し、コミットした / コミットの直後に findById・findByIds・findPageSweepable で読む", async () => {
        const k = await kit(makeHarness);
        const photo = k.accepted(at(-1));
        await insert(k.h, photo);
        expect((await get(k.h, photo.id)).entity).toEqual(photo);
        expect((await findByIds(k.h, [photo.id])).map((f) => f.entity)).toEqual(
          [photo],
        );
        expect(idsOf(await sweepable(k.h))).toEqual([photo.id]);
      });

      it("photoAssetRepository#48 UnitOfWork の中で写真を2枚 insert し、その後に例外を投げた / findByIds で2枚を読む", async () => {
        const k = await kit(makeHarness);
        const [a, b] = [k.accepted(), k.accepted()];
        await expect(
          k.h.uow.run(async ({ photoAssetRepository }) => {
            await photoAssetRepository.insert(a);
            await photoAssetRepository.insert(b);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findByIds(k.h, [a.id, b.id])).toEqual([]);
      });

      it("photoAssetRepository#49 写真 A・B を読んだ。B の版は、別の UnitOfWork の save で進んでいる / 1つの UnitOfWork で、A の claim と B の claim を save する", async () => {
        const k = await kit(makeHarness);
        const A = await stored(k, k.accepted());
        const B_ = await stored(k, k.accepted());
        const readA = await get(k.h, A.id);
        const readB = await get(k.h, B_.id);
        await save(k.h, PhotoAsset.discard(B_), readB.expectedVersion);
        const owner = k.ownerOf("listing");
        await expect(
          k.h.uow.run(async ({ photoAssetRepository }) => {
            await photoAssetRepository.save(
              PhotoAsset.claim(A, owner, k.alice),
              readA.expectedVersion,
            );
            await photoAssetRepository.save(
              PhotoAsset.claim(B_, owner, k.alice),
              readB.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await get(k.h, A.id)).entity).toMatchObject({
          stage: "stored",
          owner: null,
        });
      });

      it("photoAssetRepository#50 UnitOfWork の中で discard を save し、その後に例外を投げた / findById で読む", async () => {
        const k = await kit(makeHarness);
        const photo = await stored(k, k.accepted());
        const read = await get(k.h, photo.id);
        await expect(
          k.h.uow.run(async ({ photoAssetRepository }) => {
            await photoAssetRepository.save(
              PhotoAsset.discard(photo),
              read.expectedVersion,
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        const after = await get(k.h, photo.id);
        expect(after.entity.stage).toBe("stored");
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });
    });
  });
}
