import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ListingEntry,
  PlaceEntry,
} from "@repo/core/domain/discovery/entry";
import type {
  ExplorationQueries,
  ListingsOfRegionQuery,
} from "@repo/core/domain/discovery/ports/explorationQueries";
import { listingEntryFrom, placeEntryFrom } from "./discoveryRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * `ExplorationQueries` over the Lunt state object (`store/discovery.ts`
 * selects; this side rehydrates). Read-only; never joins a unit of work.
 */
export class DoExplorationQueries implements ExplorationQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

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
}
