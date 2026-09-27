import { Skeleton } from "@/components/ui/Skeleton";

/**
 * CS-01 of a detail screen (DT-01 / DT-02): the DetailHero-shaped frame
 * shown while a navigation's detail loads (the route's pending view).
 */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="container detail-page">
      <div className="loading detail" role="status">
        <p className="loading__text">{label}</p>
        <Skeleton className="skeleton--hero" />
        <Skeleton className="skeleton--kind" />
        <Skeleton className="skeleton--name" />
        <Skeleton className="skeleton--place" />
        <Skeleton className="skeleton--line" />
        <Skeleton className="skeleton--line-short" />
        <Skeleton className="skeleton--button" />
      </div>
    </div>
  );
}
