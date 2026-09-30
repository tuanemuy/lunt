"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { type EntryMemory, useHistoryEntryKey } from "./entryMemory";

export type ListPage<T> = Readonly<{ items: readonly T[]; count: number }>;

/** A list with the pages loaded so far. */
export type PagedState<T> = Readonly<{
  items: readonly T[];
  count: number;
  pages: number;
}>;

type Options<T> = Readonly<{
  /** Names this list and its query within the history entry. */
  name: string;
  first: ListPage<T>;
  pageSize: number;
  idOf: (item: T) => string;
  fetchPage: (page: number) => Promise<ListPage<T>>;
  memory: EntryMemory<PagedState<T>>;
  /** A failure other than CS-02 (e.g. the target stopped being viewable). */
  onFailure?: (error: ErrorState) => Promise<boolean>;
}>;

export type PagedList<T> = Readonly<{
  items: readonly T[];
  count: number;
  hasMore: boolean;
  loading: boolean;
  /** The last 「続き」 failed (CS-02); what was loaded stays. */
  failed: boolean;
  loadMore: () => void;
  /** Put on the 「続きを読み込む」 wrapper: it loads as it comes into view. */
  sentinel: RefObject<HTMLDivElement | null>;
}>;

function appendNew<T>(
  current: readonly T[],
  more: readonly T[],
  idOf: (item: T) => string,
): readonly T[] {
  const seen = new Set(current.map(idOf));
  return [...current, ...more.filter((item) => !seen.has(idOf(item)))];
}

/**
 * CF-05 for a list read by offset: the first page from the server render,
 * the next as the end comes into view (or on 「続きを読み込む」), repeats
 * dropped by id. What was loaded is remembered for the history entry, so
 * returning from a detail shows it again.
 */
export function usePagedList<T>({
  name,
  first,
  pageSize,
  idOf,
  fetchPage,
  memory,
  onFailure,
}: Options<T>): PagedList<T> {
  const entry = useHistoryEntryKey();
  const [state, setState] = useState<PagedState<T>>(
    () =>
      memory.recall(entry, name) ?? {
        items: first.items,
        count: first.count,
        pages: 1,
      },
  );
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = state.pages * pageSize < state.count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await fetchPage(state.pages + 1);
        const next: PagedState<T> = {
          items: appendNew(state.items, page.items, idOf),
          count: page.count,
          pages: state.pages + 1,
        };
        setState(next);
        memory.remember(entry, name, next);
        setFailed(false);
      } catch (error) {
        if (
          onFailure !== undefined &&
          (await onFailure(classifyError(error)))
        ) {
          return;
        }
        setFailed(true);
      }
    });
  }, [state, fetchPage, idOf, memory, entry, name, onFailure]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((each) => each.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  return {
    items: state.items,
    count: state.count,
    hasMore,
    loading,
    failed,
    loadMore,
    sentinel,
  };
}
