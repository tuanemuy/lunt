import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { CoverPhoto } from "@repo/core/domain/discovery/entry";
import type {
  ListingSummary,
  OccasionSummary,
  PlaceSummary,
  RegionSummary,
} from "@repo/core/domain/discovery/viewProjection";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { RequestContainer } from "../di/types";

/**
 * Display refs of the photos a result shows, keyed by `PhotoId`
 * (`PhotoStorage.displayRefs`). Every photo id in the result has an entry.
 */
export type PhotoRefs = Readonly<Record<PhotoId, PhotoDisplayRef>>;

/** Today's calendar day in Japan time, from the container's clock. */
export const todayOf = (
  container: Pick<RequestContainer, "clock">,
): LocalDate => LocalDate.fromInstant(container.clock.now());

/** Display refs of `photoIds` (any number, repeats allowed), in 100-id batches. */
export async function photoRefsOf(
  container: Pick<RequestContainer, "photoStorage">,
  photoIds: readonly PhotoId[],
): Promise<PhotoRefs> {
  const distinct = [...new Set(photoIds)];
  const refs: Record<PhotoId, PhotoDisplayRef> = {};
  for (let i = 0; i < distinct.length; i += IdBatch.maxSize) {
    const batch = await container.photoStorage.displayRefs(
      distinct.slice(i, i + IdBatch.maxSize),
    );
    for (const [photoId, ref] of batch) refs[photoId] = ref;
  }
  return refs;
}

export const coverPhotoIds = (cover: CoverPhoto | null): readonly PhotoId[] =>
  cover === null ? [] : [cover.photoId];

export const listingSummaryPhotoIds = (
  summary: ListingSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const placeSummaryPhotoIds = (
  summary: PlaceSummary,
): readonly PhotoId[] => coverPhotoIds(summary.cover);

export const regionSummaryPhotoIds = (
  summary: RegionSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const occasionSummaryPhotoIds = (
  summary: OccasionSummary,
): readonly PhotoId[] => [summary.cover.photoId];
