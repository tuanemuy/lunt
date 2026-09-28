import type { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import {
  type ListingPreview,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { ManualEnd } from "@repo/core/domain/listing/offering";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { NotFoundError } from "../errors";
import { type CategoryView, displayRefsOf } from "../listing/managedListing";
import { PLACE_NOT_FOUND } from "../place/places";
import type { ActorServiceArgs } from "../types";

export type PreviewListingSubmissionInput = Readonly<{
  placeId: PlaceId;
  /** The content being entered (a revision's desired content). */
  content: ListingContentInput;
}>;

export type ListingSubmissionPreview = Readonly<{
  /** The viewer-facing summary and detail (`ViewProjection.previewListing`). */
  preview: ListingPreview;
  /** The category resolved to an active one; `null` without one. */
  category: CategoryView | null;
  /** Display refs of the content's photos (cover included). */
  photoRefs: ReadonlyMap<PhotoId, PhotoDisplayRef>;
}>;

/**
 * Before a listing application or a listing revision application is
 * submitted, the entered content shaped exactly as viewers would see it
 * (LST-12, LST-13; `spec/usecases/application.md`
 * 「previewListingSubmission」): the cover, the place's and region's names,
 * the category resolved to an active one, the offering status. Content
 * lacking the publish condition is projected too. Nothing is written and
 * no stored application or listing is read.
 *
 * - `NotFoundError` when the place is not viewable (suspended, missing).
 * - `BusinessRuleError`: `ListingContent.create`'s codes.
 */
export async function previewListingSubmission({
  container,
  input,
}: ActorServiceArgs<PreviewListingSubmissionInput>): Promise<ListingSubmissionPreview> {
  const content = ListingContent.create(input.content);
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const place =
      (await ctx.placeRepository.findById(input.placeId))?.entity ?? null;
    if (place === null || !VisibilityPolicy.isPlaceViewable(place)) {
      throw new NotFoundError(PLACE_NOT_FOUND, "The place is not viewable");
    }
    const catalog = (await ctx.categoryCatalogRepository.find()).entity;
    return { place, catalog };
  });
  const preview = ViewProjection.previewListing(
    {
      content,
      manualEnd: ManualEnd.none(),
      place: read.place,
      // Region affiliations land with Region (stage 3); until then none.
      affiliations: null,
      regions: [],
    },
    LocalDate.fromInstant(container.clock.now()),
  );
  const category = CategoryCatalog.resolveOrNull(
    read.catalog,
    content.categoryId,
  );
  return {
    preview,
    category:
      category === null ? null : { id: category.id, name: category.name },
    photoRefs: await displayRefsOf(
      container,
      content.photos.items.map((photo) => photo.photoId),
    ),
  };
}
