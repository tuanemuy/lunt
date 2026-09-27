import type { PlaceCommand, PlaceQueries } from "../protocol/place";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Place's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Place starts at 11; take the next free number across all
 * domains for any later migration.
 */
export const PLACE_MIGRATIONS: readonly Migration[] = [];

export const placeQueryHandlers: QueryHandlersOf<PlaceQueries> = {};

export const placeCommandHandlers: CommandHandlersOf<PlaceCommand> = {};
