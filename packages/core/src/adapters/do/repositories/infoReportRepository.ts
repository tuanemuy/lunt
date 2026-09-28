import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { InfoReportId, PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import {
  type ConfirmationRequestedInfoReport,
  InfoReport,
  type OpenInfoReport,
} from "@repo/core/domain/moderation/infoReport";
import type { InfoReportRepository } from "@repo/core/domain/moderation/ports/infoReportRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { InfoReportRecord } from "../protocol/moderation";

const integrity = (message: string) =>
  new SystemError(SystemErrorCode.DataIntegrityError, message);

/**
 * `InfoReportRepository` over the Lunt state object. Reads query the object
 * immediately; writes append commands the object applies — with the
 * id-uniqueness and optimistic-lock checks — when the unit of work commits.
 */
export class DoInfoReportRepository implements InfoReportRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toReport(record: InfoReportRecord): InfoReport {
    const ids = [
      record.id,
      record.target.placeId,
      record.reporter,
      ...(record.target.listingId === null ? [] : [record.target.listingId]),
    ];
    const malformed = ids.find(
      (id: unknown) =>
        typeof id !== "string" || this.idGenerator.parse(id) === null,
    );
    if (malformed !== undefined) {
      throw integrity(`Stored info report has malformed id: ${malformed}`);
    }
    try {
      return InfoReport.reconstruct({
        ...record,
        receivedAt: new Date(record.receivedAt),
        requestedAt:
          record.requestedAt === null ? null : new Date(record.requestedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored info report violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  static toRecord(report: InfoReport): InfoReportRecord {
    const snapshot = InfoReport.snapshot(report);
    return {
      ...snapshot,
      receivedAt: snapshot.receivedAt.getTime(),
      requestedAt: snapshot.requestedAt?.getTime() ?? null,
    };
  }

  findById(id: InfoReportId): Promise<Versioned<InfoReport> | null> {
    return mapDoError("Failed to find info report", async () => {
      const record = await this.client.query("moderation.findInfoReport", {
        id,
      });
      return record === null
        ? null
        : {
            entity: this.toReport(record),
            expectedVersion: record.version as ExpectedVersion<InfoReport>,
          };
    });
  }

  findUnresolved(
    pagination: Pagination,
  ): Promise<
    PaginationResult<OpenInfoReport | ConfirmationRequestedInfoReport>
  > {
    return mapDoError("Failed to find unresolved info reports", async () => {
      const result = await this.client.query(
        "moderation.findUnresolvedInfoReports",
        { page: pagination.page, limit: pagination.limit },
      );
      return {
        items: result.items.map((record) => {
          const report = this.toReport(record);
          if (report.status === "resolved") {
            throw integrity(`Info report ${report.id} is resolved`);
          }
          return report;
        }),
        count: result.count,
      };
    });
  }

  findConfirmationRequestedByPlace(
    placeId: PlaceId,
    pagination: Pagination,
  ): Promise<PaginationResult<ConfirmationRequestedInfoReport>> {
    return mapDoError("Failed to find confirmation requests", async () => {
      const result = await this.client.query(
        "moderation.findConfirmationRequestedInfoReports",
        { placeId, page: pagination.page, limit: pagination.limit },
      );
      return {
        items: result.items.map((record) => {
          const report = this.toReport(record);
          if (report.status !== "confirmationRequested") {
            throw integrity(
              `Info report ${report.id} is not confirmation-requested`,
            );
          }
          return report;
        }),
        count: result.count,
      };
    });
  }

  async insert(report: InfoReport): Promise<void> {
    this.writes.push({
      kind: "moderation.insertInfoReport",
      record: DoInfoReportRepository.toRecord(report),
    });
  }

  async save(
    report: InfoReport,
    expectedVersion: ExpectedVersion<InfoReport>,
  ): Promise<void> {
    this.writes.push({
      kind: "moderation.saveInfoReport",
      record: DoInfoReportRepository.toRecord(report),
      expectedVersion,
    });
  }
}
