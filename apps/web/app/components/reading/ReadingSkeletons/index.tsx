import { Skeleton } from "@/components/ui/Skeleton";

/** An article frame's shape (VW-09): the photo and the title. */
export function ArticleFeatureSkeleton() {
  return (
    <>
      <Skeleton className="reading-skeleton--photo" />
      <Skeleton className="reading-skeleton--name" />
    </>
  );
}

/** VW-09's CS-01, below the heading. */
export function ArticlesSkeleton() {
  return (
    <div className="loading" role="status">
      <p className="loading__text">読みものを読み込んでいます</p>
      <ArticleFeatureSkeleton />
    </div>
  );
}

/** DT-05's CS-01 (the route's pending view): the cover, the title and the first lines of the body. */
export function ArticleSkeleton() {
  return (
    <div className="container article-page">
      <div className="loading" role="status">
        <p className="loading__text">読みものを読み込んでいます</p>
        <Skeleton className="reading-skeleton--photo" />
        <Skeleton className="reading-skeleton--name" />
        <Skeleton className="reading-skeleton--line" />
        <Skeleton className="reading-skeleton--line" />
        <Skeleton className="reading-skeleton--line-short" />
      </div>
    </div>
  );
}
