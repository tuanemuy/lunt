"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { readContinuation, readFromOffset } from "@/presentation/offsetRead";
import type { ListPage } from "@/presentation/regionView";

/** Where the 「続き」 stands: the rows ahead of it, and whether the end was reached. */
type Cursor = Readonly<{ offset: number; ended: boolean }>;

const cursorAfter = <T>(first: ListPage<T>): Cursor => ({
  offset: first.items.length,
  ended: first.items.length >= first.count,
});

/**
 * CF-05 for a list whose first page comes from the loader: the first page
 * follows every reconcile (it is the prop), the pages loaded after it are
 * kept here, and a row repeated across them shows once — a row may move
 * between pages when others are added or removed meanwhile. The next page
 * is read by row offset (`readContinuation`): a row that left the list
 * ahead of it — an exclusion on this screen, a change elsewhere — does not
 * make the read skip the row after the last one shown.
 */
export function usePagedList<T>(
  first: ListPage<T>,
  pageSize: number,
  keyOf: (item: T) => string,
  fetchPage: (page: number) => Promise<ListPage<T>>,
) {
  const [later, setLater] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState(() => cursorAfter(first));
  // Callers may build `first` in render; its rows keep their identity.
  const [basis, setBasis] = useState(first.items);
  if (basis !== first.items) {
    setBasis(first.items);
    if (later.length === 0) setCursor(cursorAfter(first));
  }
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [loading, startLoading] = useTransition();
  // A state, not a ref: the footer unmounts while a board shows an
  // outcome panel, and the one mounted on return must be observed anew.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const hasMore = !cursor.ended;
  const failed = failure !== null;

  const { items, seen } = useMemo(() => {
    const keys = new Set<string>();
    const rows = [...first.items, ...later].filter((item) => {
      const key = keyOf(item);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    return { items: rows, seen: keys };
  }, [first.items, later, keyOf]);

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const read = await readContinuation({
          offset: cursor.offset,
          isShown: (item: T) => seen.has(keyOf(item)),
          readFrom: (offset) => readFromOffset(offset, pageSize, fetchPage),
        });
        setLater((current) => [...current, ...read.items]);
        setCursor({ offset: read.next, ended: read.ended });
        setFailure(null);
      } catch (error) {
        setFailure(classifyError(error));
      }
    });
  }, [fetchPage, cursor, seen, keyOf, pageSize]);

  useEffect(() => {
    if (sentinel === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, failed, loading, loadMore]);

  return {
    items,
    hasMore,
    failure,
    loading,
    loadMore,
    sentinel: setSentinel,
  };
}
