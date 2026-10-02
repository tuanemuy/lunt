import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { OverdueNotice } from "@repo/core/domain/application/overdueNotice";
import type { OverdueNoticeLedger } from "@repo/core/domain/application/ports/overdueNoticeLedger";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { ApplicationId } from "@repo/core/domain/common/ids";
import { mapDoError } from "../helpers";
import type { OverdueNoticeRecord } from "../protocol/application";
import type { RepositoryDeps } from "./deps";

/**
 * `OverdueNoticeLedger` over the Lunt state object. `record` is an upsert
 * appended to the unit of work's buffer — it commits with the scope's
 * events and never touches the application row or its version.
 */
export class DoOverdueNoticeLedger implements OverdueNoticeLedger {
  constructor(private readonly deps: RepositoryDeps) {}

  private toNotice(record: OverdueNoticeRecord): OverdueNotice {
    const pendingSince = new Date(record.pendingSince);
    if (
      this.deps.idGenerator.parse(record.applicationId) === null ||
      Number.isNaN(pendingSince.getTime())
    ) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored overdue notice of ${record.applicationId} is malformed`,
      );
    }
    return {
      applicationId: ApplicationId.create(record.applicationId),
      pendingSince,
    };
  }

  async findByApplicationIds(
    ids: readonly ApplicationId[],
  ): Promise<readonly OverdueNotice[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find overdue notices", async () => {
      const records = await this.deps.client.query(
        "application.findOverdueNotices",
        { applicationIds: ids },
      );
      return records.map((record) => this.toNotice(record));
    });
  }

  async record(notice: OverdueNotice): Promise<void> {
    this.deps.writes.push({
      kind: "application.recordOverdueNotice",
      notice: {
        applicationId: notice.applicationId,
        pendingSince: notice.pendingSince,
      },
    });
  }
}
