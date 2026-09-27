import type { DiscoveryCommand, DiscoveryQueries } from "../protocol/discovery";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Discovery's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Discovery starts at 13; take the next free number across all
 * domains for any later migration.
 */
export const DISCOVERY_MIGRATIONS: readonly Migration[] = [];

export const discoveryQueryHandlers: QueryHandlersOf<DiscoveryQueries> = {};

export const discoveryCommandHandlers: CommandHandlersOf<DiscoveryCommand> = {};
