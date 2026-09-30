import { BookmarkMerge } from "@repo/core/domain/bookmark/bookmarkMerge";
import { DeviceBookmark } from "@repo/core/domain/bookmark/deviceBookmark";
import type { Actor } from "@repo/core/domain/common/actor";
import type { RequestContainer } from "../di/types";
import { requireSignedIn } from "./signedIn";

export type MergeDeviceBookmarksInput = Readonly<{
  /**
   * The browser's device saves, 0–100 per call
   * (`BookmarkMerge.maxDeviceBookmarks`); the device sends more in runs.
   */
  bookmarks: readonly DeviceBookmark[];
}>;

/**
 * Merges the device saves of the browser that just signed in into the
 * account's bookmarks (KEP-04 / MY-02, VW-10), without asking. A target the
 * account already holds keeps its `savedAt`; duplicates on the device keep
 * the newest; a device time in the future becomes now. Targets are taken
 * over whether they exist or are viewable. All or nothing, and resending
 * the same list changes nothing more — the device clears its saves only
 * after this succeeds. No events.
 *
 * Errors: `BusinessRuleError` `COMMON_INVALID_INPUT` for more than 100
 * saves or an invalid `savedAt`; `UnauthorizedError` `LOGIN_REQUIRED`
 * without an actor.
 */
export async function mergeDeviceBookmarks({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: MergeDeviceBookmarksInput;
}>): Promise<void> {
  const signedIn = requireSignedIn(actor);
  BookmarkMerge.assertWithinLimit(input.bookmarks);
  const device = input.bookmarks.map(DeviceBookmark.create);
  const bookmarks = BookmarkMerge.plan(signedIn, device, container.clock.now());
  await container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.addAll(bookmarks),
  );
}
