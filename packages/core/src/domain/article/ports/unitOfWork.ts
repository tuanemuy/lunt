import type { ArticleRepository } from "./articleRepository";

/**
 * Article's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type ArticleRepositories = Readonly<{
  articleRepository: ArticleRepository;
}>;
