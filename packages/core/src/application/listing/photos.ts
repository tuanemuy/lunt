import type { Actor } from "@repo/core/domain/common/actor";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { PhotoOwnerRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

type PhotoContext = Pick<UnitOfWorkContext, "photoAssetRepository">;

export const listingOwner = (id: ListingId) =>
  ({ kind: "listing", id }) as const;

/** The stored records of `photoIds`, asked 100 at a time. */
export async function readPhotos(
  ctx: PhotoContext,
  photoIds: readonly PhotoId[],
): Promise<readonly Versioned<PhotoAsset>[]> {
  const unique = [...new Set(photoIds)];
  const found: Versioned<PhotoAsset>[] = [];
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    found.push(
      ...(await ctx.photoAssetRepository.findByIds(
        unique.slice(start, start + IdBatch.maxSize),
      )),
    );
  }
  return found;
}

/**
 * Makes the listing the owner of the photos a save newly adds
 * (`PhotoOwnership.claimAll`), in the caller's unit of work, all or
 * nothing. A photo already owned by this very listing id is skipped: it
 * was claimed by an earlier create of the same id, whose listing has since
 * been deleted, and that create's insert then conflicts.
 */
export async function claimListingPhotos(
  ctx: PhotoContext,
  listingId: ListingId,
  photoIds: readonly PhotoId[],
  actor: Actor,
): Promise<void> {
  if (photoIds.length === 0) return;
  const owner = listingOwner(listingId);
  const read = await readPhotos(ctx, photoIds);
  const versions = new Map(
    read.map((photo) => [photo.entity.id, photo.expectedVersion]),
  );
  const alreadyOurs = new Set(
    read
      .filter(
        ({ entity }) =>
          entity.stage === "stored" &&
          entity.owner !== null &&
          PhotoOwnerRef.equals(entity.owner, owner),
      )
      .map(({ entity }) => entity.id),
  );
  const claimed = PhotoOwnership.claimAll(
    read.map(({ entity }) => entity),
    photoIds.filter((id) => !alreadyOurs.has(id)),
    owner,
    actor,
  );
  for (const photo of claimed) {
    const version = versions.get(photo.id);
    if (version === undefined) continue;
    await ctx.photoAssetRepository.save(photo, version);
  }
}
