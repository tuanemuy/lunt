import { Skeleton } from "@/components/ui/Skeleton";

/** An EditorialFeature frame's shape (VW-05). */
export function RegionFeatureSkeleton() {
  return (
    <>
      <Skeleton className="regions__skeleton--meta" />
      <Skeleton className="regions__skeleton--catch-1" />
      <Skeleton className="regions__skeleton--catch-2" />
      <Skeleton className="regions__skeleton--photo" />
      <Skeleton className="regions__skeleton--name" />
    </>
  );
}

/** VW-05's CS-01, below the heading: the scope line and a frame. */
export function RegionsSkeleton() {
  return (
    <div className="loading" role="status">
      <p className="loading__text">街の景色を読み込んでいます</p>
      <RegionFeatureSkeleton />
    </div>
  );
}

/** A Lunt/ContentRow's shape (VW-06's places, VW-07's occasions). */
export function ContentRowSkeleton() {
  return (
    <div className="explore-skeleton-row">
      <Skeleton className="explore-skeleton--photo" />
      <div className="explore-skeleton-row__body">
        <Skeleton className="explore-skeleton--name" />
        <Skeleton className="explore-skeleton--meta" />
        <Skeleton className="explore-skeleton--small" />
      </div>
    </div>
  );
}

/** VW-07's CS-01. */
export function EventsSkeleton() {
  return (
    <div className="loading" role="status">
      <p className="loading__text">イベントを読み込んでいます</p>
      <ContentRowSkeleton />
      <ContentRowSkeleton />
    </div>
  );
}

/** Two listing cards' shape (VW-06's listings). */
export function CardPairSkeleton() {
  return (
    <div className="card-grid explore-skeleton-cards">
      <Skeleton className="explore-skeleton--card" />
      <Skeleton className="explore-skeleton--card" />
    </div>
  );
}

/** VW-06's CS-01: the title, the tabs and the first rows. */
export function RegionListSkeleton() {
  return (
    <div className="loading" role="status">
      <p className="loading__text">お店を読み込んでいます</p>
      <Skeleton className="region-list__skeleton--title" />
      <ContentRowSkeleton />
      <ContentRowSkeleton />
    </div>
  );
}
