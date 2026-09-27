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
 * nothing. A photo already owned — this listing included, e.g. one a
 * previous save removed and the release consumer has not deleted yet — is
 * `MEDIA_PHOTO_ALREADY_OWNED`.
 */
export async function claimListingPhotos(
  ctx: PhotoContext,
  listingId: ListingId,
  photoIds: readonly PhotoId[],
  actor: Actor,
): Promise<void> {
  await claim(ctx, listingOwner(listingId), photoIds, () => false, actor);
}

/**
 * `claimListingPhotos` for `createListingDraft` alone: a photo already
 * owned by this very listing id is skipped. Such a photo was claimed by an
 * earlier create of the same id whose listing has since been deleted, so
 * the create's insert conflicts and nothing commits; skipping lets that
 * conflict, not `MEDIA_PHOTO_ALREADY_OWNED`, answer the resend.
 */
export async function claimPhotosOfNewListing(
  ctx: PhotoContext,
  listingId: ListingId,
  photoIds: readonly PhotoId[],
  actor: Actor,
): Promise<void> {
  const owner = listingOwner(listingId);
  await claim(
    ctx,
    owner,
    photoIds,
    (photo) =>
      photo.stage === "stored" &&
      photo.owner !== null &&
      PhotoOwnerRef.equals(photo.owner, owner),
    actor,
  );
}

async function claim(
  ctx: PhotoContext,
  owner: ReturnType<typeof listingOwner>,
  photoIds: readonly PhotoId[],
  skip: (photo: PhotoAsset) => boolean,
  actor: Actor,
): Promise<void> {
  if (photoIds.length === 0) return;
  const read = await readPhotos(ctx, photoIds);
  const versions = new Map(
    read.map((photo) => [photo.entity.id, photo.expectedVersion]),
  );
  const skipped = new Set(
    read.filter(({ entity }) => skip(entity)).map(({ entity }) => entity.id),
  );
  const claimed = PhotoOwnership.claimAll(
    read.map(({ entity }) => entity),
    photoIds.filter((id) => !skipped.has(id)),
    owner,
    actor,
  );
  for (const photo of claimed) {
    const version = versions.get(photo.id);
    if (version === undefined) continue;
    await ctx.photoAssetRepository.save(photo, version);
  }
}
