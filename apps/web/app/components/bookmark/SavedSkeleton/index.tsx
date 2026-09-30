import { Skeleton } from "@/components/ui/Skeleton";

/** The screen's lead line, over the list (「気になるものを、あとからゆっくり。」). */
export function SavedTitle() {
  return (
    <p className="saved__title">
      気になるものを、
      <br />
      あとからゆっくり。
    </p>
  );
}

/**
 * CS-01 of VW-10: the lead line and card-shaped bars while the saves and
 * their content are read.
 */
export function SavedSkeleton() {
  return (
    <>
      <SavedTitle />
      <div className="loading" role="status">
        <p className="loading__text">保存したものを読み込んでいます</p>
        <div className="card-grid saved-skeleton">
          <Skeleton className="saved-skeleton__card" />
          <Skeleton className="saved-skeleton__card" />
        </div>
        <Skeleton className="saved-skeleton__name" />
      </div>
    </>
  );
}
