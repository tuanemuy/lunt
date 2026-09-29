import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { OccasionId } from "@repo/core/domain/common/ids";
import { Geo, MapGrid } from "@repo/core/domain/discovery/geo";
import {
  MapClustering,
  type PlaceCell,
} from "@repo/core/domain/discovery/mapClustering";
import {
  type PlaceSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { OCCASION_NOT_FOUND } from "./viewOccasion";
import { type PhotoRefs, photoRefsOf, placeSummaryPhotoIds } from "./views";

type LatLng = Readonly<{ latitude: number; longitude: number }>;

export type LocateParticipantsInput = Readonly<{
  occasionId: OccasionId;
  /** Positive integer columns and rows (`MapGrid.create`); their upper bound is the transport's. */
  grid: Readonly<{ columns: number; rows: number }>;
  /**
   * The range to divide (`GeoBounds.create`), e.g. a cluster's `extent` to
   * split it; `null` for the range holding every participant.
   */
  bounds: Readonly<{ southWest: LatLng; northEast: LatLng }> | null;
}>;

/** A map cell with its places as summaries (operating status included). */
export type ParticipantCellView =
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
      /** Always 0 here: no region is selected on the participants' map. */
      affiliatedCount: number;
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

export type LocateParticipantsOutput = Readonly<{
  /** By row, then column; empty without participants. */
  cells: readonly ParticipantCellView[];
  /** The range holding every viewable participant; `null` without any. */
  extent: GeoBounds | null;
  photos: PhotoRefs;
}>;

const summaryOf = (entry: Parameters<typeof ViewProjection.placeSummary>[0]) =>
  ViewProjection.placeSummary(entry, { kind: "displayed" });

function cellView(cell: PlaceCell): ParticipantCellView {
  switch (cell.kind) {
    case "single":
      return { ...cell, place: summaryOf(cell.place) };
    case "colocated":
      return { ...cell, places: cell.places.map(summaryOf) };
    case "cluster":
      return cell;
  }
}

const cellPhotoIds = (cell: ParticipantCellView) => {
  switch (cell.kind) {
    case "single":
      return placeSummaryPhotoIds(cell.place);
    case "colocated":
      return cell.places.flatMap(placeSummaryPhotoIds);
    case "cluster":
      return [];
  }
};

const boundsOf = (input: NonNullable<LocateParticipantsInput["bounds"]>) =>
  GeoBounds.create(
    GeoPoint.create(input.southWest.latitude, input.southWest.longitude),
    GeoPoint.create(input.northEast.latitude, input.northEast.longitude),
  );

/**
 * VW-08 (EXP-10): every viewable participant of an occasion on a map, in
 * the reference scene (closed places included, with their standing),
 * grouped by `MapClustering.cells` like the map with no region selected.
 * No browse criteria or origin apply. Needs no login.
 *
 * @throws NotFoundError `OCCASION_NOT_FOUND` when the occasion is not
 *   viewable or missing.
 * @throws BusinessRuleError `DISCOVERY_INVALID_MAP_GRID`,
 *   `COMMON_INVALID_GEO_POINT` or `COMMON_INVALID_GEO_BOUNDS` for a grid or
 *   range that cannot be built.
 */
export async function locateParticipants({
  container,
  input,
}: ServiceArgs<LocateParticipantsInput>): Promise<LocateParticipantsOutput> {
  const grid = MapGrid.create(input.grid.columns, input.grid.rows);
  const requested = input.bounds === null ? null : boundsOf(input.bounds);
  const occasion = await container.detailQueries.findOccasion(input.occasionId);
  if (occasion === null) {
    throw new NotFoundError(OCCASION_NOT_FOUND, "The occasion is not viewable");
  }
  const places = (
    await container.detailQueries.findParticipants(occasion.id)
  ).map((entry) => entry.place);
  const extent = Geo.extentOf(
    places.map((entry) => entry.place.profile.location),
  );
  const bounds = requested ?? extent;
  const cells =
    bounds === null
      ? []
      : MapClustering.cells(bounds, grid, places, null).map(cellView);
  return {
    cells,
    extent,
    photos: await photoRefsOf(container, cells.flatMap(cellPhotoIds)),
  };
}
