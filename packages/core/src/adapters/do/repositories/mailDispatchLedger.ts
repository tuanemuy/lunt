import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import {
  type MailKey,
  OccurrenceKey,
} from "@repo/core/domain/notification/occurrenceKey";
import type { MailDispatchLedger } from "@repo/core/domain/notification/ports/mailDispatchLedger";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { MailKeyRecord } from "../protocol/notification";

function toKey(record: MailKeyRecord): MailKey {
  try {
    const to = EmailAddress.create(record.to);
    if (to !== record.to) throw new Error("Stored email is not normalized");
    return { occurrenceKey: OccurrenceKey.create(record.occurrenceKey), to };
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      "Stored mail dispatch violates invariants",
      error,
    );
  }
}

/**
 * `MailDispatchLedger` over the Lunt state object. `record` buffers an
 * insert-if-absent in the unit of work, so a repeated or concurrent record
 * of the same key stays one row.
 */
export class DoMailDispatchLedger implements MailDispatchLedger {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
  ) {}

  async findDispatched(keys: readonly MailKey[]): Promise<readonly MailKey[]> {
    IdBatch.assertWithinLimit(keys);
    if (keys.length === 0) return [];
    return mapDoError("Failed to find dispatched mails", async () => {
      const records = await this.client.query(
        "notification.findDispatchedMails",
        {
          keys: keys.map(({ occurrenceKey, to }) => ({ occurrenceKey, to })),
        },
      );
      return records.map(toKey);
    });
  }

  async record(key: MailKey): Promise<void> {
    this.writes.push({
      kind: "notification.recordMailDispatch",
      key: { occurrenceKey: key.occurrenceKey, to: key.to },
    });
  }
}
