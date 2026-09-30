import type { Actor } from "@repo/core/domain/common/actor";
import {
  Pagination,
  type PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { RequestContainer } from "../di/types";
import { requireSignedIn } from "./signedIn";

export type ListBookmarksInput = Readonly<{ pagination: Pagination }>;

/** One saved reference: what to pass to `resolveReferences`, and when. */
export type SavedBookmark = Readonly<{ target: BookmarkRef; savedAt: Date }>;

export type ListBookmarksOutput = PaginationResult<SavedBookmark>;

/**
 * The signed-in account's saved references, newest `savedAt` first, ties by
 * kind (`listing` first) then id (KEP-02, KEP-03 / VW-10). Not filtered by
 * viewability: hidden and deleted targets are listed too. Their content and
 * viewability come from Discovery's `resolveReferences` over the returned
 * targets (a page holds at most 100, within its limit).
 *
 * Errors: `BusinessRuleError` `COMMON_INVALID_INPUT` for a bad pagination;
 * `UnauthorizedError` `LOGIN_REQUIRED` without an actor.
 */
export async function listBookmarks({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: ListBookmarksInput;
}>): Promise<ListBookmarksOutput> {
  const signedIn = requireSignedIn(actor);
  const pagination = Pagination.create(input.pagination);
  const page = await container.unitOfWorkProvider.run(
    ({ bookmarkRepository }) =>
      bookmarkRepository.findByAccount(signedIn.accountId, pagination),
  );
  return {
    items: page.items.map(({ target, savedAt }) => ({ target, savedAt })),
    count: page.count,
  };
}
