import type { BookmarkCommand, BookmarkQueries } from "../protocol/bookmark";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/** Bookmark's tables (migration 19 is reserved for them). */
export const BOOKMARK_MIGRATIONS: readonly Migration[] = [];

export const bookmarkQueryHandlers: QueryHandlersOf<BookmarkQueries> = {};

export const bookmarkCommandHandlers: CommandHandlersOf<BookmarkCommand> = {};
