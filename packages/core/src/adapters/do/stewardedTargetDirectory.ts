import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import type { StewardedTargetSummary } from "@repo/core/domain/authority/stewardedTarget";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { StewardedRef } from "@repo/core/domain/common/refs";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * `StewardedTargetDirectory` over the Lunt state object. The object runs
 * one lookup per target kind (`store/stewardedTargetLookups.ts`) and
 * returns the existing targets in listing order. Read-only; it never
 * joins a unit of work.
 */
export class DoStewardedTargetDirectory implements StewardedTargetDirectory {
  constructor(private readonly client: Pick<LuntStateClient, "query">) {}

  async describe(
    targets: readonly StewardedRef[],
  ): Promise<readonly StewardedTargetSummary[]> {
    IdBatch.assertWithinLimit(targets);
    if (targets.length === 0) return [];
    return mapDoError("Failed to describe stewarded targets", async () => {
      const records = await this.client.query("authority.describeTargets", {
        targets: targets.map(({ kind, id }) => ({ kind, id })),
      });
      return records.map((record) => {
        if (!StewardedRef.isKind(record.target.kind)) {
          throw new SystemError(
            SystemErrorCode.DataIntegrityError,
            `Unknown stewarded target kind: ${record.target.kind}`,
          );
        }
        return {
          target: StewardedRef.create(record.target.kind, record.target.id),
          name: record.name,
        };
      });
    });
  }
}
