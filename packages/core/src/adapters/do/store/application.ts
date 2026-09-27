import type {
  ApplicationCommand,
  ApplicationQueries,
} from "../protocol/application";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Application's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Application starts at 6; take the next free number
 * across all domains for any later migration.
 */
export const APPLICATION_MIGRATIONS: readonly Migration[] = [];

export const applicationQueryHandlers: QueryHandlersOf<ApplicationQueries> = {};

export const applicationCommandHandlers: CommandHandlersOf<ApplicationCommand> =
  {};
