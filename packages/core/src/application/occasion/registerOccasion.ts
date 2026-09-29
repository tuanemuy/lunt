import { OccasionId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { OccasionContent } from "@repo/core/domain/occasion/content";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { authorizeRole, readTargetAccess } from "../authority/access";
import { ConflictError } from "../errors";
import { claimNewPhotos } from "../place/photos";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import {
  buildOccasionContent,
  type ManagedOccasionView,
  type OccasionContentFields,
  occasionRef,
  presentManagedOccasion,
} from "./managedOccasion";

export type RegisterOccasionInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  occasionId: GeneratedId;
  content: OccasionContentFields;
}>;

/** The id is already used by an occasion with other content. */
export const OCCASION_ID_CONFLICT = "OCCASION_ID_CONFLICT";

/**
 * An operator registers a draft occasion (`spec/usecases/occasion.md`
 * 「registerOccasion」; EVT-12). The publish requirements are not checked
 * and no occasion operator is needed. The photos become the occasion's in
 * the same unit of work. No domain event.
 *
 * Idempotent create: the same id with equal content (`OccasionContent.equals`)
 * returns the stored occasion without writing; other content is a
 * `ConflictError`.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError`: `AREA_TOWN_NOT_FOUND`, `COMMON_INVALID_DATE_RANGE`,
 *   the content's value objects, and the photos' (`MEDIA_PHOTO_NOT_AVAILABLE`,
 *   `MEDIA_PHOTO_NOT_REGISTRANT`, `MEDIA_PHOTO_ALREADY_OWNED`).
 */
export async function registerOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<RegisterOccasionInput>): Promise<ManagedOccasionView> {
  const id = OccasionId.create(input.occasionId);
  const content = await buildOccasionContent(container, input.content);
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const access = await readTargetAccess(ctx, actor, occasionRef(id));
    const found = await ctx.occasionRepository.findById(id);
    if (found !== null) {
      if (!OccasionContent.equals(found.entity.content, content)) {
        throw new ConflictError(
          OCCASION_ID_CONFLICT,
          `Occasion id ${id} is already used for other content`,
        );
      }
      return { occasion: found.entity, access };
    }
    const { entity } = Occasion.register({ id, content }, now);
    await claimNewPhotos(
      ctx,
      PhotoSet.photoIds(content.photos),
      occasionRef(id),
      actor,
    );
    await ctx.occasionRepository.insert(entity);
    return { occasion: entity, access };
  });
  return presentManagedOccasion(container, read);
}
