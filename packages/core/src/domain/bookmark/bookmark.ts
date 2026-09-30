import type { Actor } from "@repo/core/domain/common/actor";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { AccountId } from "@repo/core/domain/common/ids";
import { BookmarkRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";

/**
 * An account's saved listing or place (`spec/domains/bookmark.md`). Its
 * identity is (`accountId`, `target`): no id, no version, and its content
 * never changes. Neither the target's existence nor its viewability is part
 * of it.
 */
export type Bookmark = Readonly<{
  accountId: AccountId;
  target: BookmarkRef;
  /** When it was saved; never later than its creation, never changed. */
  savedAt: Date;
}>;

/** A bookmark at rest: primitives only. */
export type BookmarkSnapshot = Readonly<{
  accountId: string;
  target: Readonly<{ kind: string; id: string }>;
  savedAt: Date;
}>;

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * A save (`savedAt` = `now`) or a merged device save (`savedAt` = the
 * device's time). A `savedAt` after `now` — a device whose clock runs
 * ahead — becomes `now`. `COMMON_INVALID_INPUT` for an invalid date.
 */
function create(
  actor: Actor,
  target: BookmarkRef,
  savedAt: Date,
  now: Date,
): Bookmark {
  if (!isValidDate(savedAt) || !isValidDate(now)) {
    throw new BusinessRuleError(
      CommonErrorCode.InvalidInput,
      "savedAt must be a valid date",
    );
  }
  return {
    accountId: actor.accountId,
    target,
    savedAt: new Date(Math.min(savedAt.getTime(), now.getTime())),
  };
}

const sameTarget = (a: BookmarkRef, b: BookmarkRef): boolean =>
  a.kind === b.kind && a.id === b.id;

function reconstruct(input: BookmarkSnapshot): Bookmark {
  try {
    if (!BookmarkRef.isKind(input.target.kind)) {
      throw new Error(`Unknown bookmark target kind: ${input.target.kind}`);
    }
    const savedAt = new Date(input.savedAt);
    if (!isValidDate(savedAt)) throw new Error("Invalid savedAt");
    return {
      accountId: AccountId.create(input.accountId),
      target: BookmarkRef.create(input.target.kind, input.target.id),
      savedAt,
    };
  } catch (error) {
    throw new RehydrationError("Stored bookmark violates invariants", error);
  }
}

const snapshot = (bookmark: Bookmark): BookmarkSnapshot => ({
  accountId: bookmark.accountId,
  target: { kind: bookmark.target.kind, id: bookmark.target.id },
  savedAt: bookmark.savedAt,
});

export const Bookmark = { create, sameTarget, reconstruct, snapshot };
