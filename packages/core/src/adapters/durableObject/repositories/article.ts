import type { ArticleRepositories } from "@repo/core/domain/article/ports/unitOfWork";
import { DoArticleRepository } from "./articleRepository";
import type { RepositoryDeps } from "./deps";

/** Article's aggregate repositories of one unit of work. */
export function createArticleRepositories(
  deps: RepositoryDeps,
): ArticleRepositories {
  return {
    articleRepository: new DoArticleRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
