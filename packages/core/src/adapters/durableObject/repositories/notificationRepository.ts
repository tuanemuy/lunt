import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import { isRehydrationError } from "@repo/core/domain/error";
import { Notification } from "@repo/core/domain/notification/notification";
import type { NotificationRepository } from "@repo/core/domain/notification/ports/notificationRepository";
import { mapDoError } from "../helpers";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { NotificationRecord } from "../protocol/notification";

/**
 * `NotificationRepository` over the Lunt state object. Reads query the
 * object immediately; `deliverAll` and `removeAllByRecipient` buffer in the
 * unit of work and apply at commit, where the store's unique
 * (`recipient`, `occurrence_key`) turns a repeated delivery into a no-op.
 */
export class DoNotificationRepository implements NotificationRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toNotification(record: NotificationRecord): Notification {
    for (const id of [record.id, record.recipient]) {
      if (this.idGenerator.parse(id) === null) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored notification has malformed id: ${id}`,
        );
      }
    }
    try {
      return Notification.reconstruct({
        id: record.id,
        recipient: record.recipient,
        occurrenceKey: record.occurrenceKey,
        occurrence: JSON.parse(record.occurrence) as unknown,
        delivery: record.delivery,
        createdAt: new Date(record.createdAt),
      });
    } catch (error) {
      if (isRehydrationError(error) || error instanceof SyntaxError) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored notification violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private static toRecord(notification: Notification): NotificationRecord {
    return {
      id: notification.id,
      recipient: notification.recipient,
      occurrenceKey: notification.occurrenceKey,
      occurrence: JSON.stringify(notification.occurrence),
      delivery: notification.delivery,
      createdAt: notification.createdAt.getTime(),
    };
  }

  async deliverAll(notifications: readonly Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    this.writes.push({
      kind: "notification.deliverAll",
      records: notifications.map(DoNotificationRepository.toRecord),
    });
  }

  async removeAllByRecipient(recipient: AccountId): Promise<void> {
    this.writes.push({ kind: "notification.removeAllByRecipient", recipient });
  }

  findByRecipient(
    recipient: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Notification>> {
    return mapDoError("Failed to find notifications", async () => {
      const page = await this.client.query("notification.findByRecipient", {
        recipient,
        page: pagination.page,
        limit: pagination.limit,
      });
      return {
        items: page.items.map((record) => this.toNotification(record)),
        count: page.count,
      };
    });
  }
}
