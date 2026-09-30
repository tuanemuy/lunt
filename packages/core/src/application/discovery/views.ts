import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { CoverPhoto } from "@repo/core/domain/discovery/entry";
import type { PlaceCell } from "@repo/core/domain/discovery/mapClustering";
import {
  type ListingSummary,
  type OccasionSummary,
  type PlaceSummary,
  type RegionSummary,
  ViewProjection,
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

/**
 * A map cell as the screen shows it: a single place's or the colocated
 * places' summaries (operating status included, the displayed region
 * named), or a cluster's count and the extent to zoom into.
 */
export type PlaceCellView =
  | Readonly<{
      kind: "single";
      column: number;
      row: number;
      place: PlaceSummary;
    }>
  | Readonly<{
      kind: "cluster";
      column: number;
      row: number;
      count: number;
      /** Places of the selected region among them (0 without one). */
      affiliatedCount: number;
      /** Read it as the next bounds to split the cluster. */
      extent: GeoBounds;
    }>
  | Readonly<{
      kind: "colocated";
      column: number;
      row: number;
      location: GeoPoint;
      /** Newest first. */
      places: readonly PlaceSummary[];
    }>;

const displayedPlace = (
  entry: Parameters<typeof ViewProjection.placeSummary>[0],
): PlaceSummary => ViewProjection.placeSummary(entry, { kind: "displayed" });

/** A cell's places as summaries naming their displayed region. */
export function placeCellView(cell: PlaceCell): PlaceCellView {
  switch (cell.kind) {
    case "single":
      return { ...cell, place: displayedPlace(cell.place) };
    case "colocated":
      return { ...cell, places: cell.places.map(displayedPlace) };
    case "cluster":
      return cell;
  }
}

export const placeCellPhotoIds = (cell: PlaceCellView): readonly PhotoId[] => {
  switch (cell.kind) {
    case "single":
      return placeSummaryPhotoIds(cell.place);
    case "colocated":
      return cell.places.flatMap(placeSummaryPhotoIds);
    case "cluster":
      return [];
  }
};

type LatLng = Readonly<{ latitude: number; longitude: number }>;

/** A range as it arrives from the transport, before `GeoBounds.create`. */
export type BoundsInput = Readonly<{ southWest: LatLng; northEast: LatLng }>;

/** A position as it arrives from the transport, before `GeoPoint.create`. */
export type PointInput = LatLng;

/**
 * `GeoBounds.create` of a transport range.
 *
 * @throws BusinessRuleError `COMMON_INVALID_GEO_POINT` or
 *   `COMMON_INVALID_GEO_BOUNDS`.
 */
export const boundsFromInput = (input: BoundsInput): GeoBounds =>
  GeoBounds.create(
    GeoPoint.create(input.southWest.latitude, input.southWest.longitude),
    GeoPoint.create(input.northEast.latitude, input.northEast.longitude),
  );

/** `GeoPoint.create` of a transport position (`COMMON_INVALID_GEO_POINT`). */
export const pointFromInput = (input: PointInput): GeoPoint =>
  GeoPoint.create(input.latitude, input.longitude);
