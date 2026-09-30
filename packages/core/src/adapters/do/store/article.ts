import type { ArticleCommand, ArticleQueries } from "../protocol/article";
import type { CommandHandlersOf } from "./commands";
import type { QueryHandlersOf } from "./queries";
import type { Migration } from "./schema";

/** Article's tables (migration 20 is reserved for them). */
export const ARTICLE_MIGRATIONS: readonly Migration[] = [];

export const articleQueryHandlers: QueryHandlersOf<ArticleQueries> = {};

export const articleCommandHandlers: CommandHandlersOf<ArticleCommand> = {};
