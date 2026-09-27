import { IdBatch } from "@repo/core/domain/common/idBatch";
import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import type { PhotoAssetRepository } from "@repo/core/domain/media/ports/photoAssetRepository";
import type { ActorServiceArgs } from "../types";

export type DuplicatePhotosInput = Readonly<{
  /** The source photos; a repeated id is duplicated once. */
  photoIds: readonly PhotoId[];
}>;

/** Each source photo's id → its duplicate's id. */
export type PhotoDuplicates = ReadonlyMap<PhotoId, PhotoId>;

async function findAll(
  repository: PhotoAssetRepository,
  ids: readonly PhotoId[],
): Promise<ReadonlyMap<PhotoId, PhotoAsset>> {
  const found = new Map<PhotoId, PhotoAsset>();
  for (let start = 0; start < ids.length; start += IdBatch.maxSize) {
    const batch = await repository.findByIds(
      ids.slice(start, start + IdBatch.maxSize),
    );
    for (const { entity } of batch) {
      found.set(entity.id, entity);
    }
  }
  return found;
}

/**
 * Duplicates photos for a listing's duplication and a reapplication after
 * an application ended (`spec/usecases/media.md` 「duplicatePhotos」;
 * LST-09, APP-04). A procedure for `duplicateListing` and
 * `prepareReapplication` to call — never a transport entry point: it does
 * not check access, so the caller must have decided the actor may use
 * these photos.
 *
 * Each duplicate keeps its source's consent and digest, is registered by
 * `actor`, and is `accepted` with its content copied; the caller marks it
 * stored (`PhotoAsset.markStored`) and sets its owner. Sources do not
 * change. All records are inserted in one unit of work, then the contents
 * are copied; a failed copy leaves `accepted` records the sweep removes.
 *
 * `BusinessRuleError` `MEDIA_DUPLICATE_SOURCE_UNAVAILABLE` when a source
 * has no record or is not `stored` — then nothing is written or copied.
 */
export async function duplicatePhotos({
  container,
  actor,
  input,
}: ActorServiceArgs<DuplicatePhotosInput>): Promise<PhotoDuplicates> {
  const sources = [...new Set(input.photoIds)];
  if (sources.length === 0) return new Map();
  const now = container.clock.now();
  const duplicates: PhotoDuplicates = new Map(
    sources.map((source) => [
      source,
      PhotoId.create(container.idGenerator.next()),
    ]),
  );

  await container.unitOfWorkProvider.run(async ({ photoAssetRepository }) => {
    const found = await findAll(photoAssetRepository, sources);
    const accepted = [...duplicates].map(([source, id]) =>
      PhotoAsset.duplicate(found.get(source) ?? null, { id, by: actor }, now),
    );
    for (const photo of accepted) await photoAssetRepository.insert(photo);
  });

  for (const [source, id] of duplicates) {
    await container.photoStorage.copy(source, id);
  }
  return duplicates;
}
