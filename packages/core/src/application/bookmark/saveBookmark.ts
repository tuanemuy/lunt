import { Bookmark } from "@repo/core/domain/bookmark/bookmark";
import type { Actor } from "@repo/core/domain/common/actor";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { RequestContainer } from "../di/types";
import { requireSignedIn } from "./signedIn";

export type SaveBookmarkInput = Readonly<{ target: BookmarkRef }>;

/**
 * Saves a listing or place to the signed-in account (KEP-01–03 / CF-04 on
 * VW-01, DT-01, DT-02, VW-10), `savedAt` now. Neither the target's existence
 * nor its viewability is checked. Saving an already-saved target succeeds
 * and keeps its `savedAt`; saving a removed one again is a new save. No
 * events.
 *
 * Errors: `UnauthorizedError` `LOGIN_REQUIRED` without an actor.
 */
export async function saveBookmark({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: SaveBookmarkInput;
}>): Promise<void> {
  const signedIn = requireSignedIn(actor);
  const now = container.clock.now();
  const bookmark = Bookmark.create(signedIn, input.target, now, now);
  await container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.add(bookmark),
  );
}
