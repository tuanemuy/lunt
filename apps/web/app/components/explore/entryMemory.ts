"use client";

import { type ParsedLocation, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/** The current history entry's key; `null` during the server render. */
export function useHistoryEntryKey(): string | null {
  return useLocation({
    select: (location) => location.state.__TSR_key ?? null,
  });
}

const MAX_LEFT = 200;
/** Each entry left before, with the `returnEpoch` it was shown at. */
const leftEntries = new Map<string, number>();
let returnEpoch = 0;

/**
 * A change made on the current screen that the screens left before may
 * show stale (a save or its removal, CF-04), made without re-reading the
 * current screen: every entry left before re-reads when it is returned to,
 * as does the current one once left and returned to (`keepOnReturn` for
 * loaders, `recallUnchanged` for an island's own read).
 */
export function rereadOnReturn(): void {
  returnEpoch += 1;
}

/**
 * Records each history entry the viewer leaves, so that a later arrival at
 * it is told apart as a return (back / forward) from a new navigation.
 * Recorded on leaving, not on showing: the router may present a new entry
 * before its loaders decide whether to re-read. Call once, in the layout
 * around the screens that use `keepOnReturn`.
 */
export function useRecordLeftEntries(): void {
  const entry = useHistoryEntryKey();
  const previous = useRef(entry);
  const shownAt = useRef(returnEpoch);
  useEffect(() => {
    const left = previous.current;
    previous.current = entry;
    if (left === entry) return;
    recordLeft(left, shownAt.current);
    shownAt.current = returnEpoch;
  }, [entry]);
  // Leaving for a screen outside the layout unmounts it.
  useEffect(() => () => recordLeft(previous.current, shownAt.current), []);
}

function recordLeft(entry: string | null, shownAt: number): void {
  if (entry === null) return;
  leftEntries.delete(entry);
  leftEntries.set(entry, shownAt);
  for (const oldest of leftEntries.keys()) {
    if (leftEntries.size <= MAX_LEFT) break;
    leftEntries.delete(oldest);
  }
}

/**
 * Route options for a browse screen (`spec/pages/browse.md` 画面群に共通
 * 「詳細から戻ると、元の画面は位置・範囲・条件・読み込んだ続きを保っている」):
 * returning to an entry left before keeps the loader data it had (no
 * re-read unless a mutation invalidated it or called `rereadOnReturn`
 * since the entry was shown), while any new navigation reads afresh. What
 * an island had loaded beyond it comes back from its `entryMemory`.
 */
export const keepOnReturn = {
  shouldReload: ({
    location,
    cause,
  }: {
    location: ParsedLocation;
    cause: "preload" | "enter" | "stay";
  }) => {
    const entry = location.state.__TSR_key;
    const shownAt = entry === undefined ? undefined : leftEntries.get(entry);
    if (shownAt !== undefined) return shownAt !== returnEpoch;
    // Opening the screen again from itself (the same keyword, the same
    // tab): the default policy would keep the match it already shows.
    return cause === "stay" ? true : undefined;
  },
};

export type EntryMemory<T> = Readonly<{
  /** What `remember` stored under `name` for `entry`, if anything. */
  recall: (entry: string | null, name: string) => T | undefined;
  /**
   * As `recall`, but nothing once `rereadOnReturn` was called after it was
   * stored: for a read that no loader repeats on return.
   */
  recallUnchanged: (entry: string | null, name: string) => T | undefined;
  /** Stores `value` under `name` for `entry`, dropping the oldest beyond the cap. */
  remember: (entry: string | null, name: string, value: T) => void;
}>;

const MAX_ENTRIES = 20;

/**
 * What a list screen had loaded, kept per history entry so that coming
 * back from a detail finds it as it was (「詳細から戻ると、元の画面は…
 * 読み込んだ続きを保っている」, `spec/pages/browse.md`). Create one per kind
 * of value at module scope.
 *
 * In memory only: a reload starts afresh, exactly as the server renders
 * it, so hydration never sees a remembered value.
 */
export function entryMemory<T>(): EntryMemory<T> {
  const memory = new Map<string, Readonly<{ value: T; epoch: number }>>();
  const slot = (entry: string, name: string) => `${entry}\n${name}`;
  const stored = (entry: string | null, name: string) =>
    entry === null ? undefined : memory.get(slot(entry, name));
  return {
    recall: (entry, name) => stored(entry, name)?.value,
    recallUnchanged: (entry, name) => {
      const kept = stored(entry, name);
      return kept?.epoch === returnEpoch ? kept.value : undefined;
    },
    remember: (entry, name, value) => {
      if (entry === null) return;
      const key = slot(entry, name);
      memory.delete(key);
      memory.set(key, { value, epoch: returnEpoch });
      for (const oldest of memory.keys()) {
        if (memory.size <= MAX_ENTRIES) break;
        memory.delete(oldest);
      }
    },
  };
}
