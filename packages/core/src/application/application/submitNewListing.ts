import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import {
  ApplicationId,
  ListingId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { applicationIdConflict, claimApplicationPhotos } from "./applicant";
import { defer, peek } from "./deferredInput";
import {
  readPremiseFacts,
  readSubmissionFindings,
  referencedTargets,
  referenceViewability,
} from "./facts";

export type SubmitNewListingInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  placeId: PlaceId;
  /** Photos with framing, name, description, category, offering. */
  content: ListingContentInput;
}>;

/**
 * A user applies for a new listing of a place without a steward (LST-12,
 * APP-04; `spec/usecases/application.md` 「submitNewListing」). The content
 * meets the publish condition, under an active category; it reserves the
 * listing id the approval creates the listing under. No slot: listings of
 * a place may be applied for repeatedly. Every photo becomes the
 * application's. Emits `application.submitted` (operator seat).
 *
 * Checks, in order (`spec/usecases/application.md` l.67): the same id,
 * the premises, the viewable targets, an active duplicate, the content
 * (the entered values are built before the unit of work, their errors
 * held back until here), the photos. An entered input that does not make
 * valid values never equals a stored application: `ConflictError`.
 *
 * Idempotent create: the same place and entered content
 * (`ListingContent.equals`) return the stored application — even after
 * its category was retired; other content is `ConflictError`.
 *
 * - `BusinessRuleError`: `APPLICATION_PLACE_HAS_STEWARD`,
 *   `APPLICATION_TARGET_NOT_VIEWABLE`, `LISTING_PUBLISH_CONDITION_UNMET`,
 *   `LISTING_CATEGORY_NOT_AVAILABLE`, `ListingContent.create`'s codes,
 *   `MEDIA_PHOTO_*`.
 * - `ConflictError`: the id conflict, a photo's lock.
 */
export async function submitNewListing({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitNewListingInput>): Promise<ApplicationOf<"listing">> {
  const id = ApplicationId.create(input.applicationId);
  const enteredContent = defer(() => ListingContent.create(input.content));
  const target = ApplicationTarget.byIndividual(actor.accountId, {
    kind: "listing",
    placeId: input.placeId,
  });
  const viewability = await referenceViewability(
    container,
    referencedTargets(target),
  );
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      const entered = peek(enteredContent);
      if (
        entered === null ||
        !Application.matchesSubmission(found.entity, {
          target,
          content: entered,
        })
      ) {
        throw applicationIdConflict(id);
      }
      return found.entity as ApplicationOf<"listing">;
    }
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        await readPremiseFacts(ctx, target),
        viewability,
      ),
    );
    const content = ListingContent.toPublishable(enteredContent());
    const catalog = (await ctx.categoryCatalogRepository.find()).entity;
    CategoryCatalog.requireActive(catalog, content.categoryId);
    const submitted = Application.submit(
      {
        id,
        admission,
        reserved: {
          reservedListingId: ListingId.create(container.idGenerator.next()),
        },
        content,
      },
      now,
    );
    await claimApplicationPhotos(ctx, id, submitted.claimedPhotoIds, actor);
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
