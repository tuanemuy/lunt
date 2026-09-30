import type { ArticleRepositories } from "@repo/core/domain/article/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Article's aggregate repositories of one unit of work. */
export function createArticleRepositories(
  _deps: RepositoryDeps,
): ArticleRepositories {
  return {};
}
