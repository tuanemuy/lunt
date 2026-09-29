import type { RegionId } from "@repo/core/domain/common/ids";
import {
  type OccasionSummary,
  type RegionDetail,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import {
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  todayOf,
} from "./views";

/** Thrown for a region that is not viewable or does not exist (not told apart). */
export const REGION_NOT_FOUND = "REGION_NOT_FOUND";

export type ViewRegionInput = Readonly<{ regionId: RegionId }>;

export type ViewRegionOutput = Readonly<{
  /** The region's own content; its photos in registration order. */
  region: RegionDetail;
  /**
   * Every upcoming and ongoing viewable occasion `linked` to the region, in
   * 「開催日の順」 (discovery scene); empty when there is none.
   */
  occasions: readonly OccasionSummary[];
  photos: PhotoRefs;
}>;

/**
 * DT-03 (EXP-04): a region's content and its occasions. Its places,
 * listings and articles are read by the screen through
 * `listPlacesOfRegion`, `listListingsOfRegion` and `listArticlesShowcasing`.
 * Needs no login.
 *
 * @throws NotFoundError `REGION_NOT_FOUND` when the region is a draft,
 *   unpublished, suspended or missing — without telling which.
 */
export async function viewRegion({
  container,
  input,
}: ServiceArgs<ViewRegionInput>): Promise<ViewRegionOutput> {
  const today = todayOf(container);
  const region = await container.detailQueries.findRegion(input.regionId);
  if (region === null) {
    throw new NotFoundError(REGION_NOT_FOUND, "The region is not viewable");
  }
  const occasions = (
    await container.detailQueries.findOccasionsRelatedTo(
      { kind: "region", id: region.id },
      today,
    )
  ).map((occasion) => ViewProjection.occasionSummary(occasion, today));
  const detail = ViewProjection.regionDetail(region);
  return {
    region: detail,
    occasions,
    photos: await photoRefsOf(container, [
      ...detail.photos.map((photo) => photo.photoId),
      ...occasions.flatMap(occasionSummaryPhotoIds),
    ]),
  };
}
