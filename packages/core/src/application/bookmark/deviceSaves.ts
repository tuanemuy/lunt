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

/** The longest target id a device save may carry, as the merge's transport accepts it. */
const MAX_ID_LENGTH = 128;

/**
 * A stored entry as the merge's transport would take it — a bookmark
 * kind, an id of 1–128 characters once trimmed (kept trimmed, as the
 * server stores it), a time a `Date` can hold — or `null`.
 */
const readDeviceSave = (value: unknown): DeviceSave | null => {
  if (typeof value !== "object" || value === null) return null;
  const { kind, id, savedAt } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !BookmarkRef.isKind(kind)) return null;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return null;
  if (typeof savedAt !== "number" || Number.isNaN(new Date(savedAt).getTime()))
    return null;
  return { kind, id: trimmed, savedAt };
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
  maxIdLength: MAX_ID_LENGTH,

  /**
   * Reads a stored list, dropping entries the merge's transport would
   * refuse — one of them would fail its whole batch every time: a blank
   * or overlong id, a time a `Date` cannot hold. Ids are trimmed, so the
   * device and the account name a target alike. Of duplicate targets the
   * newest stays, as `BookmarkMerge` does.
   */
  parse: (raw: unknown): readonly DeviceSave[] => {
    if (!Array.isArray(raw)) return [];
    const newest = new Map<string, DeviceSave>();
    for (const value of raw) {
      const save = readDeviceSave(value);
      if (save === null) continue;
      const key = `${save.kind}:${save.id}`;
      const seen = newest.get(key);
      if (seen !== undefined && seen.savedAt >= save.savedAt) continue;
      newest.set(key, save);
    }
    return [...newest.values()];
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
