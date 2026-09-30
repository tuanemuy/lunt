import type { Actor } from "@repo/core/domain/common/actor";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { ContentRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Bookmark } from "./bookmark";
import type { DeviceBookmark } from "./deviceBookmark";

const maxDeviceBookmarks = 100;

/**
 * The account bookmarks a merge adds (`spec/domains/bookmark.md`
 * 「BookmarkMerge」): one per target, keeping the newest device `savedAt`
 * (clamped to `now` by `Bookmark.create`), in first-seen order. Whether the
 * account already holds a target is `BookmarkRepository.addAll`'s concern.
 * 0–100 device saves per merge (`COMMON_INVALID_INPUT` above); the device
 * sends more in runs of 100.
 */
function plan(
  actor: Actor,
  device: readonly DeviceBookmark[],
  now: Date,
): readonly Bookmark[] {
  if (device.length > maxDeviceBookmarks) {
    throw new BusinessRuleError(
      CommonErrorCode.InvalidInput,
      `At most ${maxDeviceBookmarks} device bookmarks per merge`,
    );
  }
  const newest = new Map<string, DeviceBookmark>();
  for (const saved of device) {
    const key = ContentRef.key(saved.target);
    const seen = newest.get(key);
    if (seen === undefined || saved.savedAt > seen.savedAt) {
      newest.set(key, saved);
    }
  }
  return [...newest.values()].map((saved) =>
    Bookmark.create(actor, saved.target, saved.savedAt, now),
  );
}

export const BookmarkMerge = { maxDeviceBookmarks, plan };
