import type { AreaCommand, AreaQueries } from "../protocol/area";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Area's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Area has no tables of its own (its master is static assets); take the next free number across all
 * domains for any later migration.
 */
export const AREA_MIGRATIONS: readonly Migration[] = [];

export const areaQueryHandlers: QueryHandlersOf<AreaQueries> = {};

export const areaCommandHandlers: CommandHandlersOf<AreaCommand> = {};
