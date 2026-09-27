import type { ModerationQueries } from "../protocol/moderation";
import { CONTENT_LOOKUPS, describeContent } from "./contentLookups";
import type { QueryHandlersOf } from "./queries";

/**
 * Moderation's reads. Its tables (takedown claims, info reports) land with
 * stage 2; until then it only hosts `ContentDirectory`'s read.
 */
export const moderationQueryHandlers: QueryHandlersOf<ModerationQueries> = {
  "moderation.describeContent": (sql, { targets }) =>
    describeContent(sql, targets, CONTENT_LOOKUPS),
};
