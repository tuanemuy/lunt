import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { PhotoId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type {
  ContentDirectory,
  ContentSummary,
} from "@repo/core/domain/moderation/ports/contentDirectory";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * `ContentDirectory` over the Lunt state object. The object runs one lookup
 * per content kind (`store/contentLookups.ts`) and returns the existing
 * targets in `ContentOrder`. Read-only; it never joins a unit of work.
 */
export class DoContentDirectory implements ContentDirectory {
  constructor(private readonly client: Pick<LuntStateClient, "query">) {}

  async describe(
    targets: readonly ContentRef[],
  ): Promise<readonly ContentSummary[]> {
    IdBatch.assertWithinLimit(targets);
    if (targets.length === 0) return [];
    return mapDoError("Failed to describe content", async () => {
      const records = await this.client.query("moderation.describeContent", {
        targets: targets.map(({ kind, id }) => ({ kind, id })),
      });
      return records.map((record) => {
        if (!ContentRef.isKind(record.target.kind)) {
          throw new SystemError(
            SystemErrorCode.DataIntegrityError,
            `Unknown content kind: ${record.target.kind}`,
          );
        }
        return {
          target: ContentRef.create(record.target.kind, record.target.id),
          name: record.name,
          photoIds: record.photoIds.map((id) => PhotoId.create(id)),
        };
      });
    });
  }
}
