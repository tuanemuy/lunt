import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { AccountId, ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { Bookmark } from "../bookmark";
import { BookmarkMerge } from "../bookmarkMerge";
import { DeviceBookmark } from "../deviceBookmark";

const actor = { accountId: AccountId.create("account-a") };
const L: BookmarkRef = { kind: "listing", id: ListingId.create("x") };
const P: BookmarkRef = { kind: "place", id: PlaceId.create("x") };
const M: BookmarkRef = { kind: "listing", id: ListingId.create("m") };
const NOW = new Date("2026-09-30T00:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof BusinessRuleError ? error.code : "other";
  }
};

describe("Bookmark", () => {
  it("keeps a savedAt at or before now and clamps a later one to now", () => {
    expect(Bookmark.create(actor, L, minutes(-5), NOW)).toEqual({
      accountId: actor.accountId,
      target: L,
      savedAt: minutes(-5),
    });
    expect(Bookmark.create(actor, L, minutes(5), NOW).savedAt).toEqual(NOW);
  });

  it("refuses an invalid date", () => {
    expect(
      codeOf(() => Bookmark.create(actor, L, new Date(Number.NaN), NOW)),
    ).toBe(CommonErrorCode.InvalidInput);
  });

  it("tells targets apart by kind and id", () => {
    expect(Bookmark.sameTarget(L, { kind: "listing", id: L.id })).toBe(true);
    expect(Bookmark.sameTarget(L, P)).toBe(false);
    expect(Bookmark.sameTarget(L, M)).toBe(false);
  });

  it("reconstructs its snapshot and refuses a broken one", () => {
    const b = Bookmark.create(actor, P, minutes(-1), NOW);
    expect(Bookmark.reconstruct(Bookmark.snapshot(b))).toEqual(b);
    expect(() =>
      Bookmark.reconstruct({
        ...Bookmark.snapshot(b),
        target: { kind: "region", id: "r" },
      }),
    ).toThrow(RehydrationError);
    expect(() =>
      Bookmark.reconstruct({ ...Bookmark.snapshot(b), accountId: " " }),
    ).toThrow(RehydrationError);
    expect(() =>
      Bookmark.reconstruct({
        ...Bookmark.snapshot(b),
        savedAt: new Date(Number.NaN),
      }),
    ).toThrow(RehydrationError);
  });
});

describe("DeviceBookmark", () => {
  it("accepts a valid date and refuses an invalid one", () => {
    expect(DeviceBookmark.create({ target: L, savedAt: NOW })).toEqual({
      target: L,
      savedAt: NOW,
    });
    expect(
      codeOf(() =>
        DeviceBookmark.create({ target: L, savedAt: new Date(Number.NaN) }),
      ),
    ).toBe(CommonErrorCode.InvalidInput);
  });

  it("is equal by target", () => {
    expect(
      DeviceBookmark.equals(
        { target: L, savedAt: minutes(-1) },
        { target: L, savedAt: minutes(-2) },
      ),
    ).toBe(true);
    expect(
      DeviceBookmark.equals(
        { target: L, savedAt: NOW },
        { target: P, savedAt: NOW },
      ),
    ).toBe(false);
  });
});

describe("BookmarkMerge.plan", () => {
  it("returns nothing for nothing", () => {
    expect(BookmarkMerge.plan(actor, [], NOW)).toEqual([]);
  });

  it("keeps the newest of duplicates and clamps future times to now", () => {
    expect(
      BookmarkMerge.plan(
        actor,
        [
          { target: L, savedAt: minutes(-3) },
          { target: P, savedAt: minutes(10) },
          { target: L, savedAt: minutes(-1) },
          { target: L, savedAt: minutes(-2) },
        ],
        NOW,
      ),
    ).toEqual([
      { accountId: actor.accountId, target: L, savedAt: minutes(-1) },
      { accountId: actor.accountId, target: P, savedAt: NOW },
    ]);
  });

  it("takes up to 100 device saves per merge", () => {
    const device = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        target: { kind: "listing", id: ListingId.create(`l${i}`) } as const,
        savedAt: NOW,
      }));
    expect(BookmarkMerge.plan(actor, device(100), NOW)).toHaveLength(100);
    expect(codeOf(() => BookmarkMerge.plan(actor, device(101), NOW))).toBe(
      CommonErrorCode.InvalidInput,
    );
  });
});
