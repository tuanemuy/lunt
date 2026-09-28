import type {
  ModerationCommand,
  ModerationQueries,
} from "../protocol/moderation";
import type { CommandHandlersOf } from "./commands";
import { CONTENT_LOOKUPS, describeContent } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/**
 * Moderation's reads. Its tables (takedown claims, info reports) land with
 * stage 2; until then it only hosts `ContentDirectory`'s read.
 */
export const moderationQueryHandlers: QueryHandlersOf<ModerationQueries> = {
  "moderation.describeContent": (sql, { targets }) =>
    describeContent(sql, targets, CONTENT_LOOKUPS),
};

/** Moderation's tables (migration 14 is reserved for them). */
export const MODERATION_MIGRATIONS: readonly Migration[] = [];

export const moderationCommandHandlers: CommandHandlersOf<ModerationCommand> =
  {};
