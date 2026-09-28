import type { PhotoId, TakedownClaimId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { authorizeRole } from "../authority/access";
import { displayRefsOf, photoView } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { describeTargets, requireTakedownClaim } from "./reads";
import { type TakedownClaimView, takedownClaimView } from "./views";

export type GetTakedownClaimInput = Readonly<{ claimId: TakedownClaimId }>;

/** One of the target's current photos. */
export type TakedownTargetPhoto = Readonly<{
  photoId: PhotoId;
  displayRef: PhotoDisplayRef;
  /** The claimant named this photo. */
  claimed: boolean;
}>;

export type TakedownClaimDetail = TakedownClaimView &
  Readonly<{
    /** `null` when the target is gone (or an unnamed draft). */
    targetName: string | null;
    /** The target exists (deleted and never-existing targets do not). */
    targetExists: boolean;
    /** Viewers can see the target (`ReferenceQueries.isViewable`). */
    targetViewable: boolean;
    /** The target's current photos in its order, suspended or not; empty when it is gone. */
    photos: readonly TakedownTargetPhoto[];
    /** Named photos the target no longer has (already removed). */
    removedClaimedPhotoIds: readonly PhotoId[];
  }>;

/**
 * One takedown claim, open or resolved, with its target's current state
 * and photos (`spec/usecases/moderation.md` 「getTakedownClaim」; MOD-02 /
 * OM-04). A gone or unviewable target is reported in the output, not as
 * an error; an unviewable target's photos are still listed so they can be
 * taken down.
 *
 * - `ForbiddenError` without `operate_service`; `NotFoundError`
 *   (`TAKEDOWN_CLAIM_NOT_FOUND`).
 */
export async function getTakedownClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<GetTakedownClaimInput>): Promise<TakedownClaimDetail> {
  const claim = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    return (await requireTakedownClaim(ctx, input.claimId)).entity;
  });
  const view = takedownClaimView(claim);
  const [described, viewable] = await Promise.all([
    describeTargets(container.contentDirectory, [view.target]),
    container.referenceQueries.isViewable(view.target),
  ]);
  const summary = described.get(ContentRef.key(view.target));
  const current = summary?.photoIds ?? [];
  const refs = await displayRefsOf(container.photoStorage, current);
  const claimed = new Set(view.claimedPhotoIds);
  const present = new Set(current);
  return {
    ...view,
    targetName: summary?.name ?? null,
    targetExists: summary !== undefined,
    targetViewable: viewable,
    photos: current.map((photoId) => ({
      ...photoView(refs, photoId),
      claimed: claimed.has(photoId),
    })),
    removedClaimedPhotoIds: view.claimedPhotoIds.filter(
      (photoId) => !present.has(photoId),
    ),
  };
}
