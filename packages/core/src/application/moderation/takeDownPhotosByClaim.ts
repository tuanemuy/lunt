import type { EventDraft } from "@repo/core/domain/common/event";
import type { PhotoId, TakedownClaimId } from "@repo/core/domain/common/ids";
import type { Publication } from "@repo/core/domain/common/publication";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { Listing } from "@repo/core/domain/listing/listing";
import { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import { authorizeRole } from "../authority/access";
import { NotFoundError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { ActorServiceArgs } from "../types";
import { requireTakedownClaim } from "./reads";

export type TakeDownPhotosByClaimInput = Readonly<{
  claimId: TakedownClaimId;
  /** What to remove photos from; must be the claim's target. */
  target: ContentRef;
  /** One or more of the target's photos, not only the claimed ones. */
  photoIds: readonly [PhotoId, ...PhotoId[]];
}>;

export type TakeDownPhotosByClaimOutput = Readonly<{
  /** The target's publication state after the removal; `null` for a place, which has none. */
  publication: Publication["status"] | null;
  /** This removal took the target out of `published`. */
  unpublished: boolean;
}>;

/** The target does not exist (deleted, never existed, or an article before S5). */
export const CONTENT_NOT_FOUND = "CONTENT_NOT_FOUND";

const notFound = (target: ContentRef) =>
  new NotFoundError(
    CONTENT_NOT_FOUND,
    `The ${target.kind} ${target.id} does not exist`,
  );

type Removal = Readonly<{
  eventDrafts: readonly EventDraft[];
  output: TakeDownPhotosByClaimOutput;
}>;

/** The output for a kind with a publication state, from before and after the removal. */
const publishable = (
  before: Publication,
  after: Publication,
  eventDrafts: readonly EventDraft[],
): Removal => ({
  eventDrafts,
  output: {
    publication: after.status,
    unpublished: before.status === "published" && after.status !== "published",
  },
});

/**
 * Calls the target kind's repository and `takeDownPhotos`, and saves
 * against the version read
 * (`spec/usecases/moderation.md` 「takeDownPhotosByClaim」's table).
 * Articles are wired in S5; until then an article target reads as missing.
 */
async function takeDown(
  ctx: UnitOfWorkContext,
  target: ContentRef,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): Promise<Removal> {
  switch (target.kind) {
    case "listing": {
      const found = await ctx.listingRepository.findById(target.id);
      if (found === null) throw notFound(target);
      const { entity, eventDrafts } = Listing.takeDownPhotos(
        found.entity,
        photoIds,
        now,
      );
      await ctx.listingRepository.save(entity, found.expectedVersion);
      return publishable(
        found.entity.publication,
        entity.publication,
        eventDrafts,
      );
    }
    case "place": {
      const found = await ctx.placeRepository.findById(target.id);
      if (found === null) throw notFound(target);
      const { entity, eventDrafts } = Place.takeDownPhotos(
        found.entity,
        photoIds,
        now,
      );
      await ctx.placeRepository.save(entity, found.expectedVersion);
      return {
        eventDrafts,
        output: { publication: null, unpublished: false },
      };
    }
    case "region": {
      const found = await ctx.regionRepository.findById(target.id);
      if (found === null) throw notFound(target);
      const { entity, eventDrafts } = Region.takeDownPhotos(
        found.entity,
        photoIds,
        now,
      );
      await ctx.regionRepository.save(entity, found.expectedVersion);
      return publishable(
        found.entity.publication,
        entity.publication,
        eventDrafts,
      );
    }
    case "occasion": {
      const found = await ctx.occasionRepository.findById(target.id);
      if (found === null) throw notFound(target);
      const { entity, eventDrafts } = Occasion.takeDownPhotos(
        found.entity,
        photoIds,
        now,
      );
      await ctx.occasionRepository.save(entity, found.expectedVersion);
      return publishable(
        found.entity.publication,
        entity.publication,
        eventDrafts,
      );
    }
    case "article":
      throw notFound(target);
  }
}

/**
 * An operator removes photos from a takedown claim's target
 * (`spec/usecases/moderation.md` 「takeDownPhotosByClaim」; MOD-02 / OM-04;
 * `spec/domains/index.md` 「申立てに基づく写真の削除」). The claim decides
 * whether it allows the removal (`TakedownClaim.authorizePhotoRemoval`);
 * the target's aggregate removes the photos and unpublishes a published
 * target left without any. Works while the target is suspended, with or
 * without stewards. The claim is only read — it stays open, its version
 * unchanged. Emits the aggregate's `content.photos_taken_down`,
 * `photos.released` and, for a listing, region or occasion that loses its
 * last photo while published, `{listing|region|occasion}.unpublished`
 * (`photoTakedown`). Removed photos cannot be restored.
 *
 * Checked in the order the spec fixes: `ForbiddenError`
 * (`operate_service`, also when revoked before the commit);
 * `NotFoundError` (`TAKEDOWN_CLAIM_NOT_FOUND`); `BusinessRuleError` `MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED` /
 * `MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`; `NotFoundError`
 * (`CONTENT_NOT_FOUND`) for a gone target; `BusinessRuleError`
 * `{LISTING|PLACE|REGION|OCCASION}_PHOTO_NOT_FOUND` when any photo is not the target's
 * (none is removed). `ConflictError` when a manager's save commits first.
 */
export async function takeDownPhotosByClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<TakeDownPhotosByClaimInput>): Promise<TakeDownPhotosByClaimOutput> {
  const [first, ...rest] = input.photoIds;
  const photoIds: readonly [PhotoId, ...PhotoId[]] = [
    first,
    ...new Set(rest.filter((id) => id !== first)),
  ];
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const claim = await requireTakedownClaim(ctx, input.claimId);
    TakedownClaim.authorizePhotoRemoval(claim.entity, input.target, photoIds);
    const removal = await takeDown(ctx, input.target, photoIds, now);
    ctx.collectEvents(removal.eventDrafts);
    return removal.output;
  });
}
