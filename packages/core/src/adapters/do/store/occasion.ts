import type { OccasionCommand, OccasionQueries } from "../protocol/occasion";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/** Occasion's tables (migration 18 is reserved for them). */
export const OCCASION_MIGRATIONS: readonly Migration[] = [];

export const occasionQueryHandlers: QueryHandlersOf<OccasionQueries> = {};

export const occasionCommandHandlers: CommandHandlersOf<OccasionCommand> = {};
