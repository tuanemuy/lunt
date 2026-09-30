"use client";

import { useLocation } from "@tanstack/react-router";

/** The current history entry's key; `null` during the server render. */
export function useHistoryEntryKey(): string | null {
  return useLocation({
    select: (location) => location.state.__TSR_key ?? null,
  });
}

export type EntryMemory<T> = Readonly<{
  /** What `remember` stored under `name` for `entry`, if anything. */
  recall: (entry: string | null, name: string) => T | undefined;
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
  const memory = new Map<string, T>();
  const slot = (entry: string, name: string) => `${entry}\n${name}`;
  return {
    recall: (entry, name) =>
      entry === null ? undefined : memory.get(slot(entry, name)),
    remember: (entry, name, value) => {
      if (entry === null) return;
      const key = slot(entry, name);
      memory.delete(key);
      memory.set(key, value);
      for (const oldest of memory.keys()) {
        if (memory.size <= MAX_ENTRIES) break;
        memory.delete(oldest);
      }
    },
  };
}
