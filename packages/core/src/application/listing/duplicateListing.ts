import type { Actor } from "@repo/core/domain/common/actor";
import { ListingId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { Listing } from "@repo/core/domain/listing/listing";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import { authorizeOnTarget, type TargetAccess } from "../authority/access";
import { ConflictError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { duplicatePhotos } from "../media/duplicatePhotos";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedListingRead,
  type ManagedListingView,
  presentManagedListing,
  readViewContext,
  requireListing,
} from "./managedListing";
import { listingOwner, readPhotos } from "./photos";

export type DuplicateListingInput = Readonly<{
  sourceId: ListingId;
  /** The new listing's id, minted by the caller and resent unchanged on failure. */
  listingId: GeneratedId;
}>;

/** The new id holds something other than a duplicate of the source. */
export const LISTING_DUPLICATE_CONFLICT = "LISTING_DUPLICATE_CONFLICT";

type Judged =
  | Readonly<{ kind: "new" }>
  | Readonly<{ kind: "replay"; read: ManagedListingRead }>;

/**
 * Replay (the new id already holds a duplicate of `source`), conflict
 * (it holds anything else — `ConflictError`), or new.
 */
async function judge(
  ctx: UnitOfWorkContext,
  id: ListingId,
  source: Listing,
  catalog: CategoryCatalog,
  access: TargetAccess,
): Promise<Judged> {
  const existing = await ctx.listingRepository.findById(id);
  if (existing === null) {
    // A deleted duplicate's id: refuse before copying any photo.
    if (await ctx.listingRepository.isDeleted(id)) {
      throw new ConflictError(
        LISTING_DUPLICATE_CONFLICT,
        "The listing id belongs to a deleted listing",
      );
    }
    return { kind: "new" };
  }
  if (!Listing.isDuplicateOf(existing.entity, source, catalog)) {
    throw new ConflictError(
      LISTING_DUPLICATE_CONFLICT,
      "The listing id is already used for other content",
    );
  }
  const view = await readViewContext(ctx, existing.entity.placeId);
  return {
    kind: "replay",
    read: { ...view, access, listing: existing.entity },
  };
}

const authorize = (ctx: UnitOfWorkContext, actor: Actor, source: Listing) =>
  authorizeOnTarget(ctx, actor, "manage_target", {
    kind: "place",
    id: source.placeId,
  });

/**
 * Copies a listing into a new draft of the same place
 * (`spec/usecases/listing.md` 「duplicateListing」; LST-09): name,
 * description, category (resolved), photos (order and framing, duplicated
 * by Media) — no offering, no suspension. Any source state works; the
 * source does not change.
 *
 * Two units of work around Media's `duplicatePhotos`: a read-only one
 * decides replay / conflict before any copy, the writing one re-checks the
 * new id, marks the copies stored, makes the new listing their owner and
 * inserts it. A source deleted meanwhile is still copied as read. Copies
 * left unowned by a failure are swept by Media.
 *
 * - `NotFoundError` when the source does not exist; `ForbiddenError`
 *   (`manage_target` on its place).
 * - `ConflictError` when the new id holds other content or a deleted listing.
 * - `BusinessRuleError` `MEDIA_DUPLICATE_SOURCE_UNAVAILABLE` when a source
 *   photo was discarded before the copy.
 */
export async function duplicateListing({
  container,
  actor,
  input,
}: ActorServiceArgs<DuplicateListingInput>): Promise<ManagedListingView> {
  const id = ListingId.create(input.listingId);
  const first = await container.unitOfWorkProvider.run(async (ctx) => {
    const source = (await requireListing(ctx, input.sourceId)).entity;
    const access = await authorize(ctx, actor, source);
    const catalog = (await ctx.categoryCatalogRepository.find()).entity;
    return { source, judged: await judge(ctx, id, source, catalog, access) };
  });
  if (first.judged.kind === "replay") {
    return presentManagedListing(container, first.judged.read);
  }
  const { source } = first;

  const duplicates = await duplicatePhotos({
    container,
    actor,
    input: { photoIds: PhotoSet.photoIds(source.content.photos) },
  });

  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const access = await authorize(ctx, actor, source);
    const view = await readViewContext(ctx, source.placeId);
    const judged = await judge(ctx, id, source, view.catalog, access);
    if (judged.kind === "replay") return judged.read;
    const { entity } = Listing.duplicate(
      source,
      { id, photoIds: duplicates },
      view.catalog,
      now,
    );
    const copies = await readPhotos(ctx, [...duplicates.values()]);
    const stored = copies.map(({ entity: photo }) =>
      photo.stage === "accepted" ? PhotoAsset.markStored(photo) : photo,
    );
    const claimed = PhotoOwnership.claimAll(
      stored,
      [...duplicates.values()],
      listingOwner(id),
      actor,
    );
    const versions = new Map(
      copies.map((copy) => [copy.entity.id, copy.expectedVersion]),
    );
    for (const photo of claimed) {
      const version = versions.get(photo.id);
      if (version !== undefined) {
        await ctx.photoAssetRepository.save(photo, version);
      }
    }
    await ctx.listingRepository.insert(entity);
    return { ...view, access, listing: entity };
  });
  return presentManagedListing(container, read);
}
