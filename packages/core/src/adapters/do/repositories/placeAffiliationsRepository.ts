import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { PlaceId, type RegionId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { PlaceAffiliationsRepository } from "@repo/core/domain/region/ports/placeAffiliationsRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { PlaceAffiliationsRecord } from "../protocol/region";

const isAffiliationList = (
  value: unknown,
): value is readonly Readonly<{ regionId: unknown; affiliatedAt: unknown }>[] =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "object" && item !== null);

/**
 * `PlaceAffiliationsRepository` over the Lunt state object. The object
 * keeps the reverse index (`region_affiliations`) in step with every
 * committed snapshot, so `findAffiliatedPlaces` always agrees with
 * `findById`.
 */
export class DoPlaceAffiliationsRepository
  implements PlaceAffiliationsRepository
{
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  /** A stored record as the aggregate; `DATA_INTEGRITY_ERROR` when it is not one. */
  static toAggregate(
    record: PlaceAffiliationsRecord,
    idGenerator: IdGenerator,
  ): PlaceAffiliations {
    // The store passes the JSON column through unchecked.
    const affiliations: unknown = record.affiliations;
    if (!isAffiliationList(affiliations)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored affiliations of place ${record.placeId} are malformed`,
      );
    }
    const ids: unknown[] = [
      record.placeId,
      ...affiliations.map((affiliation) => affiliation.regionId),
      ...(record.chosenRepresentative === null
        ? []
        : [record.chosenRepresentative]),
    ];
    const malformed = ids.find(
      (id) => typeof id !== "string" || idGenerator.parse(id) === null,
    );
    if (
      malformed !== undefined ||
      affiliations.some((a) => typeof a.affiliatedAt !== "number")
    ) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored affiliations of place ${record.placeId} have a malformed value`,
      );
    }
    try {
      return PlaceAffiliations.reconstruct({
        placeId: record.placeId,
        affiliations: affiliations.map((affiliation) => ({
          regionId: String(affiliation.regionId),
          affiliatedAt: new Date(Number(affiliation.affiliatedAt)),
        })),
        chosenRepresentative: record.chosenRepresentative,
        updatedAt: new Date(record.updatedAt),
        version: record.version,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored place affiliations violate invariants",
          error,
        );
      }
      throw error;
    }
  }

  static toRecord(a: PlaceAffiliations): PlaceAffiliationsRecord {
    const snapshot = PlaceAffiliations.snapshot(a);
    return {
      placeId: snapshot.placeId,
      affiliations: snapshot.affiliations.map((affiliation) => ({
        regionId: affiliation.regionId,
        affiliatedAt: affiliation.affiliatedAt.getTime(),
      })),
      chosenRepresentative: snapshot.chosenRepresentative,
      updatedAt: snapshot.updatedAt.getTime(),
      version: snapshot.version,
    };
  }

  findById(placeId: PlaceId): Promise<Versioned<PlaceAffiliations> | null> {
    return mapDoError("Failed to find place affiliations", async () => {
      const record = await this.client.query("region.findPlaceAffiliations", {
        placeId,
      });
      return record === null
        ? null
        : {
            entity: DoPlaceAffiliationsRepository.toAggregate(
              record,
              this.idGenerator,
            ),
            expectedVersion:
              record.version as ExpectedVersion<PlaceAffiliations>,
          };
    });
  }

  findAffiliatedPlaces(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceId>> {
    return mapDoError("Failed to find affiliated places", async () => {
      const result = await this.client.query("region.findAffiliatedPlaces", {
        regionId,
        page: pagination.page,
        limit: pagination.limit,
      });
      const malformed = result.items.find(
        (id) => this.idGenerator.parse(id) === null,
      );
      if (malformed !== undefined) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored affiliation has malformed place id: ${malformed}`,
        );
      }
      return {
        items: result.items.map((id) => PlaceId.create(id)),
        count: result.count,
      };
    });
  }

  async insert(a: PlaceAffiliations): Promise<void> {
    this.writes.push({
      kind: "region.insertPlaceAffiliations",
      record: DoPlaceAffiliationsRepository.toRecord(a),
    });
  }

  async save(
    a: PlaceAffiliations,
    expectedVersion: ExpectedVersion<PlaceAffiliations>,
  ): Promise<void> {
    this.writes.push({
      kind: "region.savePlaceAffiliations",
      record: DoPlaceAffiliationsRepository.toRecord(a),
      expectedVersion,
    });
  }
}
