import { Skeleton } from "@/components/ui/Skeleton";

/** CS-01 of VW-02: エリア and ジャンル with their controls' shapes. */
export function FilterSkeleton() {
  return (
    <div className="container filter">
      <h1 className="sr-only">絞り込み</h1>
      <div className="loading" role="status">
        <p className="loading__text">エリアとジャンルを読み込んでいます</p>
        <Skeleton className="filter__skeleton--heading" />
        <Skeleton className="filter__skeleton--button" />
        <Skeleton className="filter__skeleton--heading" />
        <span className="filter__skeleton-row">
          <Skeleton className="filter__skeleton--chip" />
          <Skeleton className="filter__skeleton--chip" />
          <Skeleton className="filter__skeleton--chip" />
        </span>
      </div>
    </div>
  );
}
