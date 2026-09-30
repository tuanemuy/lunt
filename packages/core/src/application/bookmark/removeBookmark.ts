import type { Actor } from "@repo/core/domain/common/actor";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { RequestContainer } from "../di/types";
import { requireSignedIn } from "./signedIn";

export type RemoveBookmarkInput = Readonly<{ target: BookmarkRef }>;

/**
 * Removes a target from the signed-in account's bookmarks (KEP-01–03 /
 * CF-04), viewable or not. Removing a target that is not saved succeeds and
 * changes nothing. No events.
 *
 * Errors: `UnauthorizedError` `LOGIN_REQUIRED` without an actor.
 */
export async function removeBookmark({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: RemoveBookmarkInput;
}>): Promise<void> {
  const signedIn = requireSignedIn(actor);
  await container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.remove(signedIn.accountId, input.target),
  );
}
