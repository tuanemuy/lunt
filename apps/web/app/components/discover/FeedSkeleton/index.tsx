import { Skeleton } from "@/components/ui/Skeleton";

/**
 * CS-01 of VW-01 (36 読み込み): the feed opens with a large frame, so the
 * bars take its shape — location, two catch lines, the photo, the name —
 * over the first cards.
 */
export function FeedSkeleton() {
  return (
    <div className="container discover discover--spaced">
      <h1 className="sr-only">みつける</h1>
      <div className="loading" role="status">
        <p className="loading__text">街の景色を読み込んでいます</p>
        <Skeleton className="discover__skeleton--catch-1" />
        <Skeleton className="discover__skeleton--catch-2" />
        <Skeleton className="discover__skeleton--photo" />
        <Skeleton className="discover__skeleton--meta" />
        <Skeleton className="discover__skeleton--name" />
        <div className="card-grid">
          <Skeleton className="discover__skeleton--card" />
          <Skeleton className="discover__skeleton--card" />
        </div>
      </div>
    </div>
  );
}
