import { Skeleton } from "@/components/ui/Skeleton";

function RowBars() {
  return (
    <span className="search__skeleton-row">
      <Skeleton className="search__skeleton--photo" />
      <span className="search__skeleton-lines">
        <Skeleton className="search__skeleton--name" />
        <Skeleton className="search__skeleton--meta" />
      </span>
    </span>
  );
}

/** CS-01 of VW-03: a kind's heading over ContentRow-shaped bars. */
export function SearchSkeleton({ keyword }: { keyword: string }) {
  return (
    <div className="loading" role="status">
      <p className="loading__text">「{keyword}」を探しています</p>
      <Skeleton className="search__skeleton--heading" />
      <RowBars />
      <RowBars />
    </div>
  );
}
