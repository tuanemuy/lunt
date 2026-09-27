import type { ListingCommand, ListingQueries } from "../protocol/listing";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Listing's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Listing starts at 12; take the next free number across all
 * domains for any later migration.
 */
export const LISTING_MIGRATIONS: readonly Migration[] = [];

export const listingQueryHandlers: QueryHandlersOf<ListingQueries> = {};

export const listingCommandHandlers: CommandHandlersOf<ListingCommand> = {};
