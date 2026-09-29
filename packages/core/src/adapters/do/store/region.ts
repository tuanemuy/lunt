import type { RegionCommand, RegionQueries } from "../protocol/region";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/** Region's tables (migration 17 is reserved for them). */
export const REGION_MIGRATIONS: readonly Migration[] = [];

export const regionQueryHandlers: QueryHandlersOf<RegionQueries> = {};

export const regionCommandHandlers: CommandHandlersOf<RegionCommand> = {};
