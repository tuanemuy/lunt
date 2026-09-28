import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { ApplicationId, type ListingId } from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { ListingPatch } from "@repo/core/domain/listing/patch";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { applicationIdConflict, claimApplicationPhotos } from "./applicant";
import { defer, peek } from "./deferredInput";
import {
  listingViewability,
  readListingFacts,
  readSubmissionFindings,
} from "./facts";

export type SubmitListingRevisionInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  listingId: ListingId;
  /** The whole desired content of the listing. */
  content: ListingContentInput;
}>;

/**
 * The patch from a listing's present content to `desired`, meeting the
 * publish condition; a changed category must be active. What submission
 * and resubmission build a listing revision's content with.
 *
 * - `BusinessRuleError`: `LISTING_PUBLISH_CONDITION_UNMET`,
 *   `COMMON_INVALID_FIELD_PATCH`, `LISTING_CATEGORY_NOT_AVAILABLE`.
 */
export async function listingPatchOf(
  ctx: Pick<UnitOfWorkContext, "categoryCatalogRepository">,
  current: ListingContent,
  desired: ListingContent,
): Promise<ListingPatch> {
  const patch = ListingPatch.between(
    current,
    ListingContent.toPublishable(desired),
  );
  const category = FieldPatch.valueOf(patch, "categoryId");
  if (category !== undefined) {
    const catalog = (await ctx.categoryCatalogRepository.find()).entity;
    CategoryCatalog.requireActive(catalog, category);
  }
  return patch;
}

/**
 * A user applies for a revision of a published listing of a place without
 * a steward (LST-13, APP-04; `spec/usecases/application.md`
 * 「submitListingRevision」). The application holds only the items that
 * differ from the listing now (`ListingPatch`), the whole desired content
 * for the idempotent resend, and the listing's place. Only newly added
 * photos become the application's. Emits `application.submitted` (operator
 * seat); the listing does not change.
 *
 * Checks, in order (`spec/usecases/application.md` l.67): the same id,
 * the premises, the viewable targets, an active duplicate, the content
 * (the entered values are built before the unit of work, their errors
 * held back until here), the photos. An entered input that does not make
 * valid values never equals a stored application: `ConflictError`.
 *
 * Idempotent create: the same listing and desired content return the
 * stored application whatever became of the listing; other content is
 * `ConflictError`.
 *
 * - `BusinessRuleError`: `APPLICATION_LISTING_NOT_FOUND` (deleted),
 *   `APPLICATION_PLACE_HAS_STEWARD`, `APPLICATION_TARGET_NOT_VIEWABLE`
 *   (unpublished or suspended listing, suspended place),
 *   `APPLICATION_ALREADY_ACTIVE`, `COMMON_INVALID_FIELD_PATCH`,
 *   `LISTING_PUBLISH_CONDITION_UNMET`, `LISTING_CATEGORY_NOT_AVAILABLE`,
 *   `ListingContent.create`'s codes, `MEDIA_PHOTO_*`.
 * - `ConflictError`: the id conflict, a slot taken concurrently, a
 *   photo's lock.
 */
export async function submitListingRevision({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitListingRevisionInput>): Promise<
  ApplicationOf<"listingRevision">
> {
  const id = ApplicationId.create(input.applicationId);
  const entered = defer(() => ListingContent.create(input.content));
  const target = ApplicationTarget.byIndividual(actor.accountId, {
    kind: "listingRevision",
    listingId: input.listingId,
  });
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      const desired = peek(entered);
      if (
        desired === null ||
        !Application.matchesSubmission(found.entity, { target, desired })
      ) {
        throw applicationIdConflict(id);
      }
      return found.entity as ApplicationOf<"listingRevision">;
    }
    const listing =
      (await ctx.listingRepository.findById(input.listingId))?.entity ?? null;
    const place =
      listing === null
        ? null
        : ((await ctx.placeRepository.findById(listing.placeId))?.entity ??
          null);
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        { listing: await readListingFacts(ctx, listing) },
        listingViewability(
          { kind: "listing", id: input.listingId },
          listing,
          place,
        ),
      ),
    );
    if (listing === null) throw new Error("An admitted listing exists");
    const desired = entered();
    const submitted = Application.submit(
      {
        id,
        admission,
        reserved: { placeId: listing.placeId },
        content: await listingPatchOf(ctx, listing.content, desired),
        desired,
      },
      now,
    );
    await claimApplicationPhotos(ctx, id, submitted.claimedPhotoIds, actor);
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
