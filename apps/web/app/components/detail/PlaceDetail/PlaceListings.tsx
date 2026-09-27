"use client";

import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Skeleton } from "@/components/ui/Skeleton";
import { listPlaceListingsFn } from "@/presentation/detail";
import {
  type ListingCardItem,
  PLACE_LISTINGS_PAGE_SIZE,
  type PlaceListingsPage,
} from "@/presentation/detailView";
import { classifyError } from "@/presentation/errorState";
import { ListingCards } from "../ListingCard";

function appendNew(
  current: readonly ListingCardItem[],
  more: readonly ListingCardItem[],
): readonly ListingCardItem[] {
  const seen = new Set(current.map((item) => item.listingId));
  return [...current, ...more.filter((item) => !seen.has(item.listingId))];
}

/**
 * DT-02's 「ここで見つかるもの」: the place's listings in the reference scene
 * (available, upcoming, ended; each newest first), 6 at a time, the rest
 * loaded as the end comes into view (CF-05). Not shown at all when the
 * place has no listing (「掲載なし」, no CS-09). If the place stopped being
 * viewable meanwhile, the route reloads into CS-06.
 */
export function PlaceListings({
  placeId,
  first,
}: {
  placeId: string;
  first: PlaceListingsPage;
}) {
  const router = useRouter();
  const [items, setItems] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [pages, setPages] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = pages * PLACE_LISTINGS_PAGE_SIZE < count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listPlaceListingsFn({
          data: { placeId, page: pages + 1 },
        });
        setItems((current) => appendNew(current, page.items));
        setCount(page.count);
        setPages((loaded) => loaded + 1);
        setFailed(false);
      } catch (error) {
        if (classifyError(error).kind === "notFound") {
          await router.invalidate({ sync: true });
          return;
        }
        setFailed(true);
      }
    });
  }, [placeId, pages, router]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  if (items.length === 0) return null;
  return (
    <section
      className="detail-section"
      aria-labelledby="dt02-listings"
      aria-busy={loading}
    >
      <SectionTitle id="dt02-listings">ここで見つかるもの</SectionTitle>
      <ListingCards items={items} />
      {failed ? (
        <Notice
          tone="error"
          title="続きの掲載を読み込めませんでした"
          actions={
            <button className="text-button" type="button" onClick={loadMore}>
              もう一度読み込む
            </button>
          }
        >
          通信状況を確認して、もう一度お試しください。
        </Notice>
      ) : loading ? (
        <div className="loading" role="status">
          <p className="more-status">続きの掲載を読み込んでいます</p>
          <div className="card-grid">
            <Skeleton className="dt02-more__photo" />
            <Skeleton className="dt02-more__photo" />
          </div>
        </div>
      ) : hasMore ? (
        <div ref={sentinel}>
          <Button variant="secondary" fit onClick={loadMore}>
            続きを読み込む
          </Button>
        </div>
      ) : count > PLACE_LISTINGS_PAGE_SIZE ? (
        <p className="more-status">掲載は以上です</p>
      ) : null}
    </section>
  );
}
