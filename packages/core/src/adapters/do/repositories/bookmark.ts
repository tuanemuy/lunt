import type { BookmarkRepositories } from "@repo/core/domain/bookmark/ports/unitOfWork";
import type { RepositoryDeps } from "./deps";

/** Bookmark's aggregate repositories of one unit of work. */
export function createBookmarkRepositories(
  _deps: RepositoryDeps,
): BookmarkRepositories {
  return {};
}
