import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { OccasionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import { Version } from "@repo/core/domain/common/version";
import { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import type { HoldingStatusRecord } from "@repo/core/domain/occasion/holdingStatusObserver";
import type {
  HoldingStatusLedger,
  OccasionToObserve,
} from "@repo/core/domain/occasion/ports/holdingStatusLedger";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { HoldingStatusRecordRecord } from "../protocol/occasion";
import { occasionFromRecord } from "./occasionRepository";

const integrity = (message: string, cause?: unknown): SystemError =>
  new SystemError(SystemErrorCode.DataIntegrityError, message, cause);

/** `HoldingStatusLedger` over the Lunt state object's record table. */
export class DoHoldingStatusLedger implements HoldingStatusLedger {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toRecord(row: HoldingStatusRecordRecord): HoldingStatusRecord {
    if (this.idGenerator.parse(row.occasionId) === null) {
      throw integrity(
        `Stored holding status record has malformed id: ${row.occasionId}`,
      );
    }
    const { lastObserved } = row;
    if (lastObserved !== null && !HoldingStatus.is(lastObserved)) {
      throw integrity(`Stored holding status record has ${lastObserved}`);
    }
    try {
      return {
        occasionId: OccasionId.create(row.occasionId),
        lastObserved,
        observedVersion: Version.create(row.observedVersion),
        nextChangeOn:
          row.nextChangeOn === null ? null : LocalDate.parse(row.nextChangeOn),
      };
    } catch (error) {
      throw integrity("Stored holding status record is invalid", error);
    }
  }

  findToObserve(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<OccasionToObserve>> {
    return mapDoError("Failed to find occasions to observe", async () => {
      const page = await this.client.query("occasion.findToObserve", {
        today,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map(
          (item): OccasionToObserve => ({
            occasion: occasionFromRecord(item.occasion, this.idGenerator),
            record: item.record === null ? null : this.toRecord(item.record),
          }),
        ),
        count: page.count,
      };
    });
  }

  find(occasionId: OccasionId): Promise<HoldingStatusRecord | null> {
    return mapDoError("Failed to find holding status record", async () => {
      const row = await this.client.query("occasion.findHoldingStatus", {
        occasionId,
      });
      return row === null ? null : this.toRecord(row);
    });
  }

  async put(record: HoldingStatusRecord): Promise<void> {
    this.writes.push({
      kind: "occasion.putHoldingStatus",
      record: {
        occasionId: record.occasionId,
        lastObserved: record.lastObserved,
        observedVersion: record.observedVersion,
        nextChangeOn: record.nextChangeOn,
      },
    });
  }
}
