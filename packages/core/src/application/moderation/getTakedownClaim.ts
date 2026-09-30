import type { PhotoId, TakedownClaimId } from "@repo/core/domain/common/ids";
import type {
  Publication,
  UnpublishReason,
} from "@repo/core/domain/common/publication";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { authorizeRole } from "../authority/access";
import { displayRefsOf, photoView } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { describeTargets, requireTakedownClaim } from "./reads";
import { type TakedownClaimView, takedownClaimView } from "./views";

export type GetTakedownClaimInput = Readonly<{ claimId: TakedownClaimId }>;

/** An article target's publication state; OM-04 is where operators see it (OM-03 has no articles). */
export type TakedownTargetPublication = Readonly<{
  status: "draft" | "published" | "unpublished";
  /** Why an unpublished article is unpublished; `null` otherwise. */
  reason: UnpublishReason | null;
}>;

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
    /** An existing article's publication state; `null` for any other target, or a gone one. */
    targetPublication: TakedownTargetPublication | null;
  }>;

/**
 * One takedown claim, open or resolved, with its target's current state
 * and photos (`spec/usecases/moderation.md` 「getTakedownClaim」; MOD-02 /
 * OM-04). A gone or unviewable target is reported in the output, not as
 * an error; an unviewable target's photos are still listed so they can be
 * taken down. An article target also carries its publication state, read
 * in the same unit of work: OM-04 is the only place operators see it.
 *
 * - `NotFoundError` (`TAKEDOWN_CLAIM_NOT_FOUND`), checked before access;
 *   `ForbiddenError` without `operate_service`.
 */
export async function getTakedownClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<GetTakedownClaimInput>): Promise<TakedownClaimDetail> {
  const { claim, targetPublication } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      const found = await requireTakedownClaim(ctx, input.claimId);
      await authorizeRole(ctx, actor, "operate_service");
      const { target } = found.entity.ground;
      const article =
        target.kind === "article"
          ? await ctx.articleRepository.findById(target.id)
          : null;
      return {
        claim: found.entity,
        targetPublication:
          article === null ? null : publicationOf(article.entity.publication),
      };
    },
  );
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
    targetPublication,
  };
}

const publicationOf = (
  publication: Publication,
): TakedownTargetPublication => ({
  status: publication.status,
  reason: publication.status === "unpublished" ? publication.reason : null,
});
