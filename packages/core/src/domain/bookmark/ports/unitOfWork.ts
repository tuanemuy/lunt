import type { BookmarkRepository } from "./bookmarkRepository";

/**
 * Bookmark's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type BookmarkRepositories = Readonly<{
  bookmarkRepository: BookmarkRepository;
}>;
