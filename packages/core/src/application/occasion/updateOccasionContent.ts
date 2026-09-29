import type { OccasionId, PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { OccasionContent } from "@repo/core/domain/occasion/content";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { authorizeOnTarget } from "../authority/access";
import { ConflictError } from "../errors";
import { claimNewPhotos } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import {
  buildOccasionContent,
  type ManagedOccasionView,
  type OccasionContentFields,
  occasionRef,
  presentManagedOccasion,
  requireOccasion,
} from "./managedOccasion";

export type UpdateOccasionContentInput = Readonly<{
  occasionId: OccasionId;
  /** The occasion's version when editing started. */
  version: number;
  content: OccasionContentFields;
}>;

/** Someone saved the occasion after this edit started. */
export const OCCASION_EDIT_CONFLICT = "OCCASION_EDIT_CONFLICT";

const added = (
  before: OccasionContent,
  after: OccasionContent,
): readonly PhotoId[] => {
  const kept = new Set(PhotoSet.photoIds(before.photos));
  return PhotoSet.photoIds(after.photos).filter((id) => !kept.has(id));
};

/**
 * The occasion's operator replaces its content (`spec/usecases/occasion.md`
 * 「updateOccasionContent」; EVT-04, EVT-13, MOD-03), in any publication
 * state, suspended or cancelled. A new period emits
 * `occasion.period_changed` (延期); participations are not touched. Added
 * photos become the occasion's; removed ones are released
 * (`photos.released`). Unchanged content writes nothing.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`manage_target`, also when it no longer holds at commit);
 *   `ConflictError` when `version` is not the
 *   stored one or a concurrent save commits first.
 * - `BusinessRuleError`: `OCCASION_PUBLISH_CONDITION_UNMET` (published;
 *   with what is missing), `AREA_TOWN_NOT_FOUND`,
 *   `COMMON_INVALID_DATE_RANGE`, the content's value objects and the added
 *   photos' (`MEDIA_PHOTO_*`).
 */
export async function updateOccasionContent({
  container,
  actor,
  input,
}: ActorServiceArgs<UpdateOccasionContentInput>): Promise<ManagedOccasionView> {
  const content = await buildOccasionContent(container, input.content);
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireOccasion(ctx, input.occasionId);
    const access = await authorizeOnTarget(
      ctx,
      actor,
      "manage_target",
      occasionRef(input.occasionId),
    );
    if (found.entity.version !== input.version) {
      throw new ConflictError(
        OCCASION_EDIT_CONFLICT,
        "The occasion was saved after this edit started",
      );
    }
    const { entity, eventDrafts } = Occasion.updateContent(
      found.entity,
      content,
      now,
    );
    if (entity !== found.entity) {
      await claimNewPhotos(
        ctx,
        added(found.entity.content, entity.content),
        occasionRef(entity.id),
        actor,
      );
      await ctx.occasionRepository.save(entity, found.expectedVersion);
      ctx.collectEvents(eventDrafts);
    }
    return { occasion: entity, access };
  });
  return presentManagedOccasion(container, read);
}
