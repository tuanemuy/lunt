"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import type { ListPage } from "@/presentation/regionView";

/**
 * CF-05 for a list whose first page comes from the loader: the first page
 * follows every reconcile (it is the prop), the pages loaded after it are
 * kept here, and a row repeated across them shows once — a row may move
 * between pages when others are added or removed meanwhile.
 */
export function usePagedList<T>(
  first: ListPage<T>,
  pageSize: number,
  keyOf: (item: T) => string,
  fetchPage: (page: number) => Promise<ListPage<T>>,
) {
  const [later, setLater] = useState<readonly T[]>([]);
  const [loadedPages, setLoadedPages] = useState(1);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = loadedPages * pageSize < first.count;
  const failed = failure !== null;

  const seen = new Set<string>();
  const items = [...first.items, ...later].filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await fetchPage(loadedPages + 1);
        setLater((current) => [...current, ...page.items]);
        setLoadedPages((pages) => pages + 1);
        setFailure(null);
      } catch (error) {
        setFailure(classifyError(error));
      }
    });
  }, [fetchPage, loadedPages]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  return { items, hasMore, failure, loading, loadMore, sentinel };
}
