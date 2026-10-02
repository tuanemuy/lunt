import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { PublishedArticle } from "@repo/core/domain/article/article";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ResolvedCriteria } from "@repo/core/domain/discovery/browseCriteria";
import type {
  ListingEntry,
  PlaceEntry,
} from "@repo/core/domain/discovery/entry";
import type { MapScope } from "@repo/core/domain/discovery/explorationFocus";
import type { PlaceCell } from "@repo/core/domain/discovery/mapClustering";
import type {
  ExplorationQueries,
  ListingsOfRegionQuery,
  PlaceCellsQuery,
  PlacesInBoundsQuery,
  RegionsQuery,
} from "@repo/core/domain/discovery/ports/explorationQueries";
import { isBusinessRuleError } from "@repo/core/domain/error";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import {
  listingEntryFrom,
  placeEntryFrom,
  publishedArticleFrom,
  publishedOccasionFrom,
  publishedRegionFrom,
} from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import type {
  CriteriaRecord,
  GeoBoundsRecord,
  GeoPointRecord,
  PlaceCellRecord,
} from "./protocol/discoveryExploration";

const criteriaRecord = (criteria: ResolvedCriteria): CriteriaRecord => ({
  areaCodes: criteria.areaCodes === null ? null : [...criteria.areaCodes],
  categoryIds: criteria.categoryIds === null ? null : [...criteria.categoryIds],
});

const pointRecord = (point: GeoPoint): GeoPointRecord => ({
  latitude: point.latitude,
  longitude: point.longitude,
});

const boundsRecord = (bounds: GeoBounds): GeoBoundsRecord => ({
  southWest: pointRecord(bounds.southWest),
  northEast: pointRecord(bounds.northEast),
});

/** `DATA_INTEGRITY_ERROR` for coordinates the object should never return. */
function rehydrated<T>(build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (isBusinessRuleError(error)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored coordinates violate invariants",
        error,
      );
    }
    throw error;
  }
}

const pointFrom = (record: GeoPointRecord): GeoPoint =>
  rehydrated(() => GeoPoint.create(record.latitude, record.longitude));

const boundsFrom = (record: GeoBoundsRecord): GeoBounds =>
  rehydrated(() =>
    GeoBounds.create(
      GeoPoint.create(record.southWest.latitude, record.southWest.longitude),
      GeoPoint.create(record.northEast.latitude, record.northEast.longitude),
    ),
  );

/**
 * `ExplorationQueries` over the Lunt state object (`store/discovery.ts`
 * and `store/discoveryExploration.ts` select; this side rehydrates).
 * Read-only; never joins a unit of work.
 */
export class DoExplorationQueries implements ExplorationQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

  findPlaceCells(query: PlaceCellsQuery): Promise<readonly PlaceCell[]> {
    return mapDoError("Failed to find place cells", async () => {
      const cells = await this.client.query("discovery.findPlaceCells", {
        bounds: boundsRecord(query.bounds),
        grid: { columns: query.grid.columns, rows: query.grid.rows },
        criteria: criteriaRecord(query.criteria),
        selectedRegionId: query.selectedRegionId,
        today: query.today,
      });
      return cells.map((cell) => this.cellFrom(cell));
    });
  }

  findMapExtent(scope: MapScope): Promise<GeoBounds | null> {
    return mapDoError("Failed to find map extent", async () => {
      const extent = await this.client.query("discovery.findMapExtent", {
        scope:
          scope.kind === "places"
            ? {
                kind: "places",
                areaCodes:
                  scope.areaCodes === null ? null : [...scope.areaCodes],
              }
            : { kind: "region", regionId: scope.regionId },
      });
      return extent === null ? null : boundsFrom(extent);
    });
  }

  findPlacesInBounds(
    query: PlacesInBoundsQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>> {
    return mapDoError("Failed to find places in bounds", async () => {
      const page = await this.client.query("discovery.findPlacesInBounds", {
        bounds: boundsRecord(query.bounds),
        criteria: criteriaRecord(query.criteria),
        origin: query.origin === null ? null : pointRecord(query.origin),
        today: query.today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          placeEntryFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findRegions(
    query: RegionsQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedRegion>> {
    return mapDoError("Failed to find regions", async () => {
      const page = await this.client.query("discovery.findRegions", {
        bounds: query.bounds === null ? null : boundsRecord(query.bounds),
        areaCodes: query.areaCodes === null ? null : [...query.areaCodes],
        vicinity:
          query.vicinity === null
            ? null
            : {
                center: pointRecord(query.vicinity.center),
                radiusMeters: query.vicinity.radiusMeters,
              },
        origin: query.origin === null ? null : pointRecord(query.origin),
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          publishedRegionFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findPlacesOfRegion(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>> {
    return mapDoError("Failed to find places of region", async () => {
      const page = await this.client.query("discovery.findPlacesOfRegion", {
        regionId,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          placeEntryFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findListingsOfRegion(
    query: ListingsOfRegionQuery,
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>> {
    return mapDoError("Failed to find listings of region", async () => {
      const page = await this.client.query("discovery.findListingsOfRegion", {
        regionId: query.regionId,
        excludingPlaceId: query.excludingPlaceId,
        today: query.today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          listingEntryFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findOccasions(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedOccasion>> {
    return mapDoError("Failed to find occasions", async () => {
      const page = await this.client.query("discovery.findOccasions", {
        today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          publishedOccasionFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  findArticles(
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>> {
    return mapDoError("Failed to find articles", async () => {
      const page = await this.client.query("discovery.findArticles", {
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) =>
          publishedArticleFrom(record, this.idGenerator),
        ),
        count: page.count,
      };
    });
  }

  private cellFrom(cell: PlaceCellRecord): PlaceCell {
    switch (cell.kind) {
      case "single":
        return { ...cell, place: placeEntryFrom(cell.place, this.idGenerator) };
      case "colocated":
        return {
          ...cell,
          location: pointFrom(cell.location),
          places: cell.places.map((place) =>
            placeEntryFrom(place, this.idGenerator),
          ),
        };
      case "cluster":
        return { ...cell, extent: boundsFrom(cell.extent) };
    }
  }
}
