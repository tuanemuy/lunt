import { Skeleton } from "@/components/ui/Skeleton";

/**
 * CS-01 of DT-03: the EditorialFeature-shaped frame shown while a
 * navigation's region loads (the route's pending view).
 */
export function RegionSkeleton() {
  return (
    <div className="container detail-page">
      <div className="loading detail" role="status">
        <p className="loading__text">街を読み込んでいます</p>
        <Skeleton className="dt03-skeleton--location" />
        <Skeleton className="dt03-skeleton--catch-1" />
        <Skeleton className="dt03-skeleton--catch-2" />
        <Skeleton className="dt03-skeleton--photo" />
        <Skeleton className="skeleton--place" />
        <Skeleton className="skeleton--button" />
      </div>
    </div>
  );
}
