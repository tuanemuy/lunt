import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  areaSelectionsOf,
  browseCriteriaOf,
  browseCriteriaSchema,
  browseSearchSchema,
} from "./browseSearch";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import {
  MAP_GRID_MAX,
  type MapExtent,
  type MapRange,
  type MapRead,
  type MapTargets,
  type ParticipantsRead,
} from "./mapView";
import { PAGINATION_MAX_PAGE } from "./pagination";
import { validateInput } from "./validator";

const finite = z.number().refine(Number.isFinite, "Must be a finite number");

const cornerSchema = z.object({ latitude: finite, longitude: finite });

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** A longitude in [-180, 180]; outside it wraps: 190 → -170, -540 → -180. */
const wrapLongitude = (value: number): number =>
  value >= -180 && value <= 180
    ? value
    : ((((value + 180) % 360) + 360) % 360) - 180;

/**
 * A map range as the transport accepts it: any finite corners, normalised
 * so `GeoBounds` takes them. Latitudes are clamped to [-90, 90] and put in
 * order. Longitudes wrap into [-180, 180]; a range spanning the whole
 * world, or one that crosses the date line after wrapping, becomes every
 * longitude — the pan across it still finds what it shows.
 */
export const mapRangeSchema = z
  .object({ southWest: cornerSchema, northEast: cornerSchema })
  .transform(({ southWest, northEast }): MapRange => {
    const south = clamp(southWest.latitude, -90, 90);
    const north = clamp(northEast.latitude, -90, 90);
    const span = northEast.longitude - southWest.longitude;
    const west = wrapLongitude(southWest.longitude);
    const east = wrapLongitude(northEast.longitude);
    const whole = Math.abs(span) >= 360 || west > east;
    return {
      southWest: {
        latitude: Math.min(south, north),
        longitude: whole ? -180 : west,
      },
      northEast: {
        latitude: Math.max(south, north),
        longitude: whole ? 180 : east,
      },
    };
  });

/** The viewer's position as the browser reported it. */
const positionSchema = z.object({
  latitude: finite.min(-90).max(90),
  longitude: finite.min(-180).max(180),
});

/** The clustering grid, capped so a request cannot ask for huge cell maps. */
const gridSchema = z.object({
  columns: z.number().int().min(1).max(MAP_GRID_MAX),
  rows: z.number().int().min(1).max(MAP_GRID_MAX),
});

const idField = z.string().trim().min(1).max(128);
const pageField = z.number().int().min(1).max(PAGINATION_MAX_PAGE);

export const mapScreenSchema = browseSearchSchema.extend({
  region: idField.optional().catch(undefined),
});

/**
 * VW-04's first screen for the URL's conditions and region (see
 * `loadMapScreen`).
 */
export const loadMapScreenFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(mapScreenSchema))
  .handler(async ({ data }) => {
    const { loadMapScreen } = await import("./mapData");
    return loadMapScreen(browseCriteriaOf(data), data.region ?? null);
  });

export const mapExtentSchema = z.object({
  area: browseSearchSchema.shape.area,
  origin: positionSchema,
});

/** VW-04: the range for the viewer's shared position (see `loadMapExtent`). */
export const findMapExtentFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(mapExtentSchema))
  .handler(async ({ data }): Promise<MapExtent> => {
    const { loadMapExtent } = await import("./mapData");
    return loadMapExtent(areaSelectionsOf({ area: data.area }), data.origin);
  });

export const mapCellsSchema = z.object({
  bounds: mapRangeSchema,
  grid: gridSchema,
  criteria: browseCriteriaSchema,
  selectedRegionId: idField.nullable(),
});

/** VW-04: the cells and regions of a range (再検索). */
export const readMapCellsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(mapCellsSchema))
  .handler(async ({ data }): Promise<MapRead> => {
    const { loadMapCells } = await import("./mapData");
    return loadMapCells(
      data.bounds,
      data.grid,
      data.criteria,
      data.selectedRegionId,
    );
  });

export const mapTargetsSchema = z.object({
  bounds: mapRangeSchema,
  criteria: browseCriteriaSchema,
  origin: positionSchema.nullable(),
  kinds: z.enum(["all", "places", "regions"]),
  page: pageField,
});

/** VW-04: a page of the list of the last searched range (CF-05). */
export const listMapTargetsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(mapTargetsSchema))
  .handler(async ({ data }): Promise<MapTargets> => {
    const { loadMapTargets } = await import("./mapData");
    return loadMapTargets(
      data.bounds,
      data.criteria,
      data.origin,
      data.kinds,
      data.page,
    );
  });

/** VW-08's first screen (see `loadParticipantsScreen`). */
export const loadParticipantsScreenFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ occasionId: idField })))
  .handler(async ({ data }) => {
    const { loadParticipantsScreen } = await import("./mapData");
    return loadParticipantsScreen(data.occasionId);
  });

export const participantCellsSchema = z.object({
  occasionId: idField,
  bounds: mapRangeSchema,
  grid: gridSchema,
});

/**
 * VW-08: the participants grouped for a range — on opening and after a
 * cluster's zoom only. `NotFoundError` once the occasion is not viewable.
 */
export const locateParticipantsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participantCellsSchema))
  .handler(async ({ data }): Promise<ParticipantsRead> => {
    const { loadParticipantCells } = await import("./mapData");
    return loadParticipantCells(data.occasionId, data.bounds, data.grid);
  });
