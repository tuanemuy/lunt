import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import type { MatchPage } from "@/presentation/opsSearch";

/**
 * CF-05 for a result list read by offset: keeps the loaded items, fetches
 * the next page when the sentinel comes into view, and drops repeats by
 * key (a target saved meanwhile may move between pages).
 */
export function useLoadMore<T>(
  first: MatchPage<T>,
  pageSize: number,
  keyOf: (item: T) => string,
  fetchPage: (page: number) => Promise<MatchPage<T>>,
) {
  const [items, setItems] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [loadedPages, setLoadedPages] = useState(1);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = loadedPages * pageSize < count;
  const failed = failure !== null;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await fetchPage(loadedPages + 1);
        setItems((current) => {
          const seen = new Set(current.map(keyOf));
          return [
            ...current,
            ...page.items.filter((item) => !seen.has(keyOf(item))),
          ];
        });
        setCount(page.count);
        setLoadedPages((pages) => pages + 1);
        setFailure(null);
      } catch (error) {
        setFailure(classifyError(error));
      }
    });
  }, [fetchPage, keyOf, loadedPages]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  return { items, count, hasMore, failure, loading, loadMore, sentinel };
}
