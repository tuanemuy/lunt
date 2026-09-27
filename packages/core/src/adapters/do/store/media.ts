import type { MediaCommand, MediaQueries } from "../protocol/media";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Media's tables. Migration versions are allocated globally
 * (`store/schema.ts`): Media starts at 10; take the next free number across all
 * domains for any later migration.
 */
export const MEDIA_MIGRATIONS: readonly Migration[] = [];

export const mediaQueryHandlers: QueryHandlersOf<MediaQueries> = {};

export const mediaCommandHandlers: CommandHandlersOf<MediaCommand> = {};
