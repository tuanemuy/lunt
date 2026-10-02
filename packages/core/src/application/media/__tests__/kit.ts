import { InMemoryPhotoBucket } from "@repo/core/adapters/inMemory/inMemoryPhotoBucket";
import { servePhoto } from "@repo/core/adapters/r2/photoDelivery";
import { R2PhotoStorage } from "@repo/core/adapters/r2/r2PhotoStorage";
import { samplePng } from "@repo/core/adapters/shared/testing/photoSamples";
import type { Actor } from "@repo/core/domain/common/actor";
import { EventId } from "@repo/core/domain/common/event";
import { AccountId, PhotoId } from "@repo/core/domain/common/ids";
import type { PhotosReleasedEvent } from "@repo/core/domain/common/photoEvents";
import { PhotoOwnerRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { PhotoFile } from "@repo/core/domain/media/photoFile";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";
import { expect } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import type {
  UnitOfWorkContext,
  UnitOfWorkProvider,
} from "../../execution/unitOfWork";
import type { GeneratedId } from "../../ports/idGenerator";
import { registerPhoto } from "../registerPhoto";
import { TEST_UNOWNED_RETENTION_MS } from "./testServices";

type Operation = "put" | "copy" | "delete";

/** Thrown by `ControllablePhotoStorage` for an injected failure. */
export class InjectedStorageFailure extends Error {
  override readonly name = "InjectedStorageFailure";
}

/**
 * The production storage adapter over an in-memory bucket, with failures
 * and hooks a test arms per photo id.
 */
export class ControllablePhotoStorage implements PhotoStorage {
  readonly bucket = new InMemoryPhotoBucket();
  private readonly inner = new R2PhotoStorage(this.bucket);
  private readonly failing = new Map<Operation, Set<string>>();
  private readonly beforePut = new Map<string, () => Promise<void>>();

  /** Makes `operation` on `photoId` fail until `heal` is called. */
  fail(operation: Operation, photoId: PhotoId): void {
    const ids = this.failing.get(operation) ?? new Set<string>();
    ids.add(photoId);
    this.failing.set(operation, ids);
  }

  heal(): void {
    this.failing.clear();
  }

  /** Runs `hook` once, when `photoId` is next put, before the content lands. */
  onNextPut(photoId: PhotoId, hook: () => Promise<void>): void {
    this.beforePut.set(photoId, hook);
  }

  private check(operation: Operation, photoId: PhotoId): void {
    if (this.failing.get(operation)?.has(photoId)) {
      throw new InjectedStorageFailure(`${operation} of ${photoId} failed`);
    }
  }

  async put(photoId: PhotoId, file: PhotoFile): Promise<void> {
    const hook = this.beforePut.get(photoId);
    if (hook !== undefined) {
      this.beforePut.delete(photoId);
      await hook();
    }
    this.check("put", photoId);
    await this.inner.put(photoId, file);
  }

  async copy(sourceId: PhotoId, destinationId: PhotoId): Promise<void> {
    this.check("copy", sourceId);
    await this.inner.copy(sourceId, destinationId);
  }

  async delete(photoId: PhotoId): Promise<void> {
    this.check("delete", photoId);
    await this.inner.delete(photoId);
  }

  displayRefs(
    photoIds: readonly PhotoId[],
  ): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>> {
    return this.inner.displayRefs(photoIds);
  }
}

/**
 * Delegates to the real provider; a test arms one hook to run inside the
 * next matching scope after its callback finished — its reads done, its
 * writes buffered — and before it commits.
 */
export class InterceptingUnitOfWorkProvider implements UnitOfWorkProvider {
  private hook: (() => Promise<void>) | null = null;
  private remaining = 0;

  constructor(readonly inner: UnitOfWorkProvider) {}

  /** Runs `hook` before the commit of the `nth` scope from now (1-based). */
  beforeCommitOf(nth: number, hook: () => Promise<void>): void {
    this.remaining = nth;
    this.hook = hook;
  }

  run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    this.remaining -= 1;
    const hook = this.remaining === 0 ? this.hook : null;
    if (hook === null) return this.inner.run(fn);
    this.hook = null;
    return this.inner.run(async (ctx) => {
      const result = await fn(ctx);
      await hook();
      return result;
    });
  }
}

export type MediaKit = ReturnType<typeof mediaKit>;

/**
 * Usecase-test kit for Media: the test container with a controllable
 * photo storage and an intercepting unit of work, people, files, and
 * readers for records and served content.
 */
export function mediaKit() {
  const storage = new ControllablePhotoStorage();
  const t = createTestContainer({
    overrides: () => ({ photoStorage: storage }),
  });
  const uow = new InterceptingUnitOfWorkProvider(
    t.container.unitOfWorkProvider,
  );
  const container = { ...t.container, unitOfWorkProvider: uow };
  const direct = uow.inner;
  let seed = 0;

  const person = (): Actor => ({
    accountId: AccountId.create(t.idGenerator.next()),
  });

  const newPhotoId = (): GeneratedId => t.idGenerator.next();

  /** A distinct valid photo file's bytes. */
  const bytes = (): Uint8Array => samplePng(++seed);

  async function register(
    actor: Actor,
    options: Readonly<{
      photoId?: GeneratedId;
      bytes?: Uint8Array;
      agreed?: boolean;
    }> = {},
  ): Promise<PhotoId> {
    const photoId = options.photoId ?? newPhotoId();
    await registerPhoto({
      container,
      actor,
      input: {
        photoId,
        bytes: options.bytes ?? bytes(),
        agreed: options.agreed ?? true,
      },
    });
    return PhotoId.create(photoId);
  }

  function find(id: PhotoId): Promise<Versioned<PhotoAsset> | null> {
    return direct.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(id),
    );
  }

  async function get(id: PhotoId): Promise<Versioned<PhotoAsset>> {
    const found = await find(id);
    if (found === null) throw new Error(`no photo ${id}`);
    return found;
  }

  /** What the photo's display ref serves now, or `null` for nothing. */
  async function served(id: PhotoId): Promise<Uint8Array | null> {
    const ref = (await storage.displayRefs([id])).get(id);
    if (ref === undefined) throw new Error(`no ref for ${id}`);
    const response = await servePhoto(
      storage.bucket,
      new Request(new URL(ref.url, "http://lunt.test")),
    );
    if (response.status === 404) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  const owner = (kind: PhotoOwnerRef["kind"]): PhotoOwnerRef =>
    PhotoOwnerRef.create(kind, t.idGenerator.next());

  /** Claims the photo for `ownerRef` the way an owning domain would. */
  async function claim(
    id: PhotoId,
    ownerRef: PhotoOwnerRef,
    by: Actor,
  ): Promise<void> {
    await direct.run(async ({ photoAssetRepository }) => {
      const read = await photoAssetRepository.findById(id);
      if (read === null) throw new Error(`no photo ${id}`);
      await photoAssetRepository.save(
        PhotoAsset.claim(read.entity, ownerRef, by),
        read.expectedVersion,
      );
    });
  }

  /** Discards the photo without deleting anything (a sweep cut short). */
  async function discardOnly(id: PhotoId): Promise<void> {
    await direct.run(async ({ photoAssetRepository }) => {
      const read = await photoAssetRepository.findById(id);
      if (read === null || read.entity.stage === "discarded") {
        throw new Error(`photo ${id} cannot be discarded`);
      }
      await photoAssetRepository.save(
        PhotoAsset.discard(read.entity),
        read.expectedVersion,
      );
    });
  }

  let events = 0;
  const released = (photoIds: readonly PhotoId[]): PhotosReleasedEvent => {
    events += 1;
    return {
      id: EventId.create(`released-${events}`),
      type: "photos.released",
      payload: { photoIds },
      occurredAt: t.clock.now(),
      aggregateId: "owner",
    };
  };

  const passRetention = () => t.clock.advance(TEST_UNOWNED_RETENTION_MS + 1);

  async function expectNoPhoto(id: PhotoId): Promise<void> {
    expect(await find(id)).toBeNull();
    expect(await served(id)).toBeNull();
  }

  return {
    ...t,
    container,
    uow,
    storage,
    person,
    newPhotoId,
    bytes,
    register,
    find,
    get,
    served,
    owner,
    claim,
    discardOnly,
    released,
    passRetention,
    expectNoPhoto,
  };
}
