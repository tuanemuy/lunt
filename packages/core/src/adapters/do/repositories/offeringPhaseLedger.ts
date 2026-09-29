import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { ListingId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import { Version } from "@repo/core/domain/common/version";
import { Listing } from "@repo/core/domain/listing/listing";
import { OfferingPhase } from "@repo/core/domain/listing/offering";
import type { OfferingPhaseRecord } from "@repo/core/domain/listing/offeringWatch";
import type {
  DriftedListing,
  OfferingPhaseLedger,
} from "@repo/core/domain/listing/ports/offeringPhaseLedger";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { OfferingPhaseRecordRecord } from "../protocol/listing";
import { restoreScanPage } from "../scan";
import { listingFromRecord } from "./listingRepository";

const integrity = (message: string, cause?: unknown): SystemError =>
  new SystemError(SystemErrorCode.DataIntegrityError, message, cause);

function phaseOf(raw: string): OfferingPhase {
  if (!OfferingPhase.is(raw)) {
    throw integrity(`Stored offering phase record has phase ${raw}`);
  }
  return raw;
}

/** `OfferingPhaseLedger` over the Lunt state object's record table. */
export class DoOfferingPhaseLedger implements OfferingPhaseLedger {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toRecord(row: OfferingPhaseRecordRecord): OfferingPhaseRecord {
    if (this.idGenerator.parse(row.listingId) === null) {
      throw integrity(
        `Stored offering phase record has malformed id: ${row.listingId}`,
      );
    }
    try {
      return {
        listingId: ListingId.create(row.listingId),
        phase: phaseOf(row.phase),
        observedVersion: Version.create(row.observedVersion),
        nextChangeOn:
          row.nextChangeOn === null ? null : LocalDate.parse(row.nextChangeOn),
      };
    } catch (error) {
      if (error instanceof SystemError) throw error;
      throw integrity("Stored offering phase record is invalid", error);
    }
  }

  findPageDrifted(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<ScanResult<DriftedListing>> {
    return mapDoError("Failed to find drifted listings", async () => {
      const page = await this.client.query("listing.findDrifted", {
        today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return restoreScanPage(
        page,
        (item) => item.listing.id,
        (item): DriftedListing => {
          const listing = listingFromRecord(item.listing, this.idGenerator);
          if (!Listing.isPublished(listing)) {
            throw integrity(`Drifted listing ${listing.id} is not published`);
          }
          return {
            listing,
            recorded: item.recorded === null ? null : phaseOf(item.recorded),
          };
        },
      );
    });
  }

  find(listingId: ListingId): Promise<OfferingPhaseRecord | null> {
    return mapDoError("Failed to find offering phase record", async () => {
      const row = await this.client.query("listing.findOfferingPhase", {
        listingId,
      });
      return row === null ? null : this.toRecord(row);
    });
  }

  async record(entry: OfferingPhaseRecord): Promise<void> {
    this.writes.push({
      kind: "listing.recordOfferingPhase",
      record: {
        listingId: entry.listingId,
        phase: entry.phase,
        observedVersion: entry.observedVersion,
        nextChangeOn: entry.nextChangeOn,
      },
    });
  }

  async remove(listingId: ListingId): Promise<void> {
    this.writes.push({ kind: "listing.removeOfferingPhase", listingId });
  }
}
