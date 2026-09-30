import {
  type DeviceSave,
  DeviceSaves,
} from "@repo/core/application/bookmark/deviceSaves";
import { BookmarkRef } from "@repo/core/domain/common/refs";
import { useSyncExternalStore } from "react";
import { mergeDeviceSavesFn } from "./bookmark";
import { classifyError, type ErrorState } from "./errorState";
import type { SaveTarget } from "./savedView";

export type { DeviceSave };

/** Where this browser keeps its saves while signed out (CF-04, V-41). */
export const DEVICE_SAVES_KEY = "lunt:saves";

/** The subset of `Storage` the store uses; `null` when storage is unavailable. */
export type SaveStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const refOf = (target: SaveTarget): BookmarkRef =>
  BookmarkRef.create(target.kind, target.id);

/**
 * The browser's device saves over a `Storage` (KEP-01–04): `DeviceSaves`'
 * rules, persisted as a JSON array under `DEVICE_SAVES_KEY`, with a
 * snapshot that keeps its identity until the stored list changes (for
 * `useSyncExternalStore`). Writes report whether they were persisted; a
 * blocked storage keeps nothing.
 */
export function createDeviceSaveStore(storage: () => SaveStorage | null) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: readonly DeviceSave[] = [];

  const readRaw = (): string | null => {
    try {
      return storage()?.getItem(DEVICE_SAVES_KEY) ?? null;
    } catch {
      return null;
    }
  };

  const snapshot = (): readonly DeviceSave[] => {
    const raw = readRaw();
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    let parsed: unknown = [];
    try {
      parsed = raw === null ? [] : JSON.parse(raw);
    } catch {
      parsed = [];
    }
    cached = DeviceSaves.parse(parsed);
    return cached;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const write = (list: readonly DeviceSave[]): boolean => {
    try {
      const target = storage();
      if (target === null) return false;
      if (list.length === 0) target.removeItem(DEVICE_SAVES_KEY);
      else target.setItem(DEVICE_SAVES_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    } finally {
      notify();
    }
  };

  return {
    snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Another tab changed the list (the `storage` event). */
    changedElsewhere: notify,
    has: (target: SaveTarget): boolean =>
      DeviceSaves.has(snapshot(), refOf(target)),
    /** Saves `target` at `now`; a saved target keeps its time. */
    save: (target: SaveTarget, now: number): boolean =>
      write(DeviceSaves.save(snapshot(), refOf(target), now)),
    remove: (target: SaveTarget): boolean =>
      write(DeviceSaves.remove(snapshot(), refOf(target))),
    /**
     * Rewrites the stored list as `snapshot` reads it: entries it dropped
     * as unusable (see `DeviceSaves.parse`) leave the device.
     */
    compact: (): boolean => {
      const list = snapshot();
      const raw = readRaw();
      if (raw === null || raw === JSON.stringify(list)) return true;
      return write(list);
    },
    /** Drops the entries a merged batch carried, keeping any saved since. */
    drop: (batch: readonly DeviceSave[]): boolean =>
      write(
        snapshot().filter(
          (entry) =>
            !batch.some(
              (sent) =>
                sent.kind === entry.kind &&
                sent.id === entry.id &&
                sent.savedAt === entry.savedAt,
            ),
        ),
      ),
  };
}

export type DeviceSaveStore = ReturnType<typeof createDeviceSaveStore>;

/** How the last merge of the device saves went (VW-10 「引き継ぎの未了」). */
export type MergeStatus =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "merging" }>
  | Readonly<{ kind: "failed"; error: ErrorState }>
  | Readonly<{ kind: "signedOut" }>;

/**
 * - `merged`: every batch reached the account and left the device.
 * - `nothing`: the device had no saves.
 * - `signedOut`: the account side refused for want of a login; the saves stay.
 * - `failed`: a batch did not go through; it and the rest stay (retry).
 */
export type MergeOutcome = "merged" | "nothing" | "signedOut" | "failed";

const STORAGE_FAILURE: ErrorState = {
  kind: "failed",
  code: null,
  message: "この端末の保存を更新できませんでした",
};

type MergeRun = { promise: Promise<MergeOutcome>; reconcileClaimed: boolean };

const REFUSED_ENTRY = /^bookmarks\.(\d+)(\.|$)/;

/** The entries of `batch` a transport refusal names (`bookmarks.{i}.…`). */
function refusedEntries(
  error: ErrorState,
  batch: readonly DeviceSave[],
): readonly DeviceSave[] {
  if (error.kind !== "invalidInput") return [];
  const refused = new Set<DeviceSave>();
  for (const field of Object.keys(error.fieldErrors)) {
    const index = REFUSED_ENTRY.exec(field)?.[1];
    const entry = index === undefined ? undefined : batch[Number(index)];
    if (entry !== undefined) refused.add(entry);
  }
  return [...refused];
}

/**
 * Sends the device saves to the account after a login (KEP-04): one
 * `mergeDeviceSavesFn` call per `DeviceSaves.batches` run, in turn, each
 * batch dropped from the device only once its call succeeded. One run at a
 * time; a caller arriving meanwhile joins it.
 */
export function createDeviceMerger(
  store: DeviceSaveStore,
  send: (batch: readonly DeviceSave[]) => Promise<unknown>,
) {
  const listeners = new Set<() => void>();
  let status: MergeStatus = { kind: "idle" };
  let run: MergeRun | null = null;

  const setStatus = (next: MergeStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  /**
   * Sends one batch; entries the transport names as refused leave the
   * device and the rest are sent again, so one broken entry cannot hold
   * back the others. `null` once the batch went through.
   */
  const sendBatch = async (
    batch: readonly DeviceSave[],
  ): Promise<Exclude<MergeOutcome, "merged" | "nothing"> | null> => {
    let sending = batch;
    while (sending.length > 0) {
      try {
        await send(sending);
        break;
      } catch (error) {
        const classified = classifyError(error);
        if (classified.kind === "loginRequired") {
          setStatus({ kind: "signedOut" });
          return "signedOut";
        }
        const refused = refusedEntries(classified, sending);
        if (refused.length === 0) {
          setStatus({ kind: "failed", error: classified });
          return "failed";
        }
        if (!store.drop(refused)) {
          setStatus({ kind: "failed", error: STORAGE_FAILURE });
          return "failed";
        }
        sending = sending.filter((entry) => !refused.includes(entry));
      }
    }
    if (!store.drop(sending)) {
      setStatus({ kind: "failed", error: STORAGE_FAILURE });
      return "failed";
    }
    return null;
  };

  const execute = async (): Promise<MergeOutcome> => {
    store.compact();
    const batches = DeviceSaves.batches(store.snapshot());
    if (batches.length === 0) {
      setStatus({ kind: "idle" });
      return "nothing";
    }
    setStatus({ kind: "merging" });
    for (const batch of batches) {
      const stopped = await sendBatch(batch);
      if (stopped !== null) return stopped;
    }
    setStatus({ kind: "idle" });
    return "merged";
  };

  const start = (): MergeRun => {
    if (run !== null) return run;
    const current: MergeRun = {
      promise: execute().finally(() => {
        run = null;
      }),
      reconcileClaimed: false,
    };
    run = current;
    return current;
  };

  return {
    status: (): MergeStatus => status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Starts a run, or joins the one under way. */
    merge: (): Promise<MergeOutcome> => start().promise,
    /**
     * `merge`, then `reconcile` once the saves reached the account — by the
     * first caller of a run only, so a screen of many toggles reloads once.
     */
    async mergeAndReconcile(reconcile: () => Promise<void>): Promise<void> {
      const current = start();
      const claims = !current.reconcileClaimed;
      current.reconcileClaimed = true;
      const outcome = await current.promise;
      if (claims && outcome === "merged") await reconcile();
    },
  };
}

export type DeviceMerger = ReturnType<typeof createDeviceMerger>;

const browserStorage = (): SaveStorage | null =>
  typeof window === "undefined" ? null : window.localStorage;

/** This browser's device saves. */
export const deviceSaves: DeviceSaveStore =
  createDeviceSaveStore(browserStorage);

/** This browser's merge of its device saves into the account. */
export const deviceMerger: DeviceMerger = createDeviceMerger(
  deviceSaves,
  (batch) => mergeDeviceSavesFn({ data: { bookmarks: batch } }),
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === DEVICE_SAVES_KEY) {
      deviceSaves.changedElsewhere();
    }
  });
}

const noSaves = (): null => null;

/**
 * The device saves, or `null` while unknown — the server render and the
 * hydrating render, which must agree whatever this browser holds; the
 * browser's list follows right after hydration.
 */
export function useDeviceSaves(
  store: DeviceSaveStore = deviceSaves,
): readonly DeviceSave[] | null {
  return useSyncExternalStore(store.subscribe, store.snapshot, noSaves);
}

const idle: MergeStatus = { kind: "idle" };

/** The merge's status (idle on the server). */
export function useMergeStatus(
  merger: DeviceMerger = deviceMerger,
): MergeStatus {
  return useSyncExternalStore(merger.subscribe, merger.status, () => idle);
}
