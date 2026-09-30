import { BookmarkMerge } from "@repo/core/domain/bookmark/bookmarkMerge";
import type { DeviceBookmark } from "@repo/core/domain/bookmark/deviceBookmark";
import { type BookmarkKind, BookmarkRef } from "@repo/core/domain/common/refs";

/**
 * One device save as a signed-out browser keeps it (JSON-safe) and as it
 * travels to `mergeDeviceBookmarks`: the target and when it was saved
 * (epoch ms, the device's clock). The server stores nothing while signed
 * out (`spec/domains/bookmark.md`).
 */
export type DeviceSave = Readonly<{
  kind: BookmarkKind;
  id: string;
  savedAt: number;
}>;

const same = (a: Pick<DeviceSave, "kind" | "id">, ref: BookmarkRef) =>
  a.kind === ref.kind && a.id === ref.id;

const isDeviceSave = (value: unknown): value is DeviceSave => {
  if (typeof value !== "object" || value === null) return false;
  const { kind, id, savedAt } = value as Record<string, unknown>;
  return (
    typeof kind === "string" &&
    BookmarkRef.isKind(kind) &&
    typeof id === "string" &&
    id.trim().length > 0 &&
    typeof savedAt === "number" &&
    Number.isFinite(savedAt)
  );
};

/**
 * The device side of saving without signing in (KEP-01–04 / CF-04, VW-10),
 * as pure functions over the browser's list so every screen treats it the
 * same way the account's bookmarks behave: saving a saved target keeps its
 * time, removing then saving again is a new save, the list reads newest
 * first (ties: `listing` before `place`, then id). The browser persists
 * the list (e.g. `localStorage`) and, once signed in, sends `batches(list)`
 * to `mergeDeviceBookmarks` one by one, dropping each batch from the device
 * only after its merge succeeded — resending a batch is harmless.
 */
export const DeviceSaves = {
  /** Reads a stored list, dropping malformed entries and duplicate targets. */
  parse: (raw: unknown): readonly DeviceSave[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const result: DeviceSave[] = [];
    for (const value of raw) {
      if (!isDeviceSave(value)) continue;
      const key = `${value.kind}:${value.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ kind: value.kind, id: value.id, savedAt: value.savedAt });
    }
    return result;
  },

  has: (list: readonly DeviceSave[], ref: BookmarkRef): boolean =>
    list.some((entry) => same(entry, ref)),

  /** Adds `ref` saved at `now`; an already-saved target keeps its time. */
  save: (
    list: readonly DeviceSave[],
    ref: BookmarkRef,
    now: number,
  ): readonly DeviceSave[] =>
    DeviceSaves.has(list, ref)
      ? list
      : [...list, { kind: ref.kind, id: ref.id, savedAt: now }],

  remove: (
    list: readonly DeviceSave[],
    ref: BookmarkRef,
  ): readonly DeviceSave[] => list.filter((entry) => !same(entry, ref)),

  /** Newest first, as the saved list shows them. */
  ordered: (list: readonly DeviceSave[]): readonly DeviceSave[] =>
    [...list].sort(
      (a, b) =>
        b.savedAt - a.savedAt ||
        a.kind.localeCompare(b.kind) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    ),

  /** The refs to hand to `resolveReferences`, in `ordered` order. */
  refs: (list: readonly DeviceSave[]): readonly BookmarkRef[] =>
    DeviceSaves.ordered(list).map((entry) =>
      BookmarkRef.create(entry.kind, entry.id),
    ),

  /** Runs of at most `BookmarkMerge.maxDeviceBookmarks` for one merge each. */
  batches: (
    list: readonly DeviceSave[],
  ): readonly (readonly DeviceSave[])[] => {
    const result: DeviceSave[][] = [];
    for (let i = 0; i < list.length; i += BookmarkMerge.maxDeviceBookmarks) {
      result.push(list.slice(i, i + BookmarkMerge.maxDeviceBookmarks));
    }
    return result;
  },

  /**
   * One transport-validated batch as `mergeDeviceBookmarks`' input. Throws
   * `COMMON_INVALID_LISTING_ID` / `COMMON_INVALID_PLACE_ID` for a blank id.
   */
  toDeviceBookmarks: (
    batch: readonly DeviceSave[],
  ): readonly DeviceBookmark[] =>
    batch.map((entry) => ({
      target: BookmarkRef.create(entry.kind, entry.id),
      savedAt: new Date(entry.savedAt),
    })),
};
