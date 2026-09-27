import type { AuthorityCommand, AuthorityQueries } from "../protocol/authority";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Authority's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Authority starts at 5; take the next free number
 * across all domains for any later migration.
 */
export const AUTHORITY_MIGRATIONS: readonly Migration[] = [];

export const authorityQueryHandlers: QueryHandlersOf<AuthorityQueries> = {};

export const authorityCommandHandlers: CommandHandlersOf<AuthorityCommand> = {};
