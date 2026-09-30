import type { BookmarkRepositories } from "@repo/core/domain/bookmark/ports/unitOfWork";
import { DoBookmarkRepository } from "./bookmarkRepository";
import type { RepositoryDeps } from "./deps";

/** Bookmark's aggregate repositories of one unit of work. */
export function createBookmarkRepositories(
  deps: RepositoryDeps,
): BookmarkRepositories {
  return {
    bookmarkRepository: new DoBookmarkRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
