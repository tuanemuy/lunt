import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { OccasionId } from "@repo/core/domain/common/ids";
import { Geo, MapGrid } from "@repo/core/domain/discovery/geo";
import { MapClustering } from "@repo/core/domain/discovery/mapClustering";
import type { OccasionName } from "@repo/core/domain/occasion/values";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { OCCASION_NOT_FOUND } from "./viewOccasion";
import {
  type PhotoRefs,
  type PlaceCellView,
  photoRefsOf,
  placeCellPhotoIds,
  placeCellView,
} from "./views";

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
export type ParticipantCellView = PlaceCellView;

export type LocateParticipantsOutput = Readonly<{
  /** The occasion's name, which the map's header shows. */
  occasionName: OccasionName;
  /** By row, then column; empty without participants. */
  cells: readonly ParticipantCellView[];
  /**
   * The participants outside the requested range, grouped on the same grid
   * over `extent` (by row, then column); empty without a range. With
   * `cells` it holds every viewable participant exactly once, so a map
   * that zooms into a range can still show the rest.
   */
  outside: readonly ParticipantCellView[];
  /** The range holding every viewable participant; `null` without any. */
  extent: GeoBounds | null;
  photos: PhotoRefs;
}>;

const boundsOf = (input: NonNullable<LocateParticipantsInput["bounds"]>) =>
  GeoBounds.create(
    GeoPoint.create(input.southWest.latitude, input.southWest.longitude),
    GeoPoint.create(input.northEast.latitude, input.northEast.longitude),
  );

/**
 * VW-08 (EXP-10): every viewable participant of an occasion on a map, in
 * the reference scene (closed places included, with their standing),
 * grouped by `MapClustering.cells` like the map with no region selected.
 * For a requested range, the participants outside it come apart in
 * `outside`, so a zoomed map shows each participant once.
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
      : MapClustering.cells(bounds, grid, places, null).map((cell) =>
          placeCellView(cell, null),
        );
  const outside =
    requested === null || extent === null
      ? []
      : MapClustering.cells(
          extent,
          grid,
          places.filter(
            (entry) => !Geo.contains(requested, entry.place.profile.location),
          ),
          null,
        ).map((cell) => placeCellView(cell, null));
  return {
    occasionName: occasion.content.name,
    cells,
    outside,
    extent,
    photos: await photoRefsOf(
      container,
      [...cells, ...outside].flatMap(placeCellPhotoIds),
    ),
  };
}
