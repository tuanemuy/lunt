import type { MailKey } from "../occurrenceKey";

/**
 * Which notification and takedown-outcome mails were sent
 * (`spec/domains/notification.md` 「MailDispatchLedger」), one record per
 * `MailKey` (`occurrenceKey` and `to` together). Records outlive the
 * recipient's account and whatever the occurrence pointed at; there is no
 * listing and no deletion.
 *
 * - `findDispatched`: the recorded keys among 0–100 `keys`
 *   (`COMMON_INVALID_INPUT` above that; callers split).
 * - `record`: adds the record; an existing one — concurrent writers
 *   included — is success, never `ConflictError`. Called inside a unit of
 *   work.
 */
export interface MailDispatchLedger {
  findDispatched(keys: readonly MailKey[]): Promise<readonly MailKey[]>;
  record(key: MailKey): Promise<void>;
}
