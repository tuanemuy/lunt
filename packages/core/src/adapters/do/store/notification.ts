import type {
  NotificationCommand,
  NotificationQueries,
} from "../protocol/notification";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Notification's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Notification starts at 7; take the next free number
 * across all domains for any later migration.
 */
export const NOTIFICATION_MIGRATIONS: readonly Migration[] = [];

export const notificationQueryHandlers: QueryHandlersOf<NotificationQueries> =
  {};

export const notificationCommandHandlers: CommandHandlersOf<NotificationCommand> =
  {};
