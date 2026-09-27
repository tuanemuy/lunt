import { Skeleton } from "@/components/ui/Skeleton";

function Row() {
  return (
    <div className="rq01-skel-row">
      <Skeleton variant="manage" className="rq01-skel-photo" />
      <div className="rq01-skel-lines">
        <Skeleton variant="manage" className="h-24 w-3/5" />
        <Skeleton variant="manage" className="h-20 w-4/5" />
      </div>
    </div>
  );
}

/** RQ-01's CS-01: photo rows shaped like the results. */
export function PlaceMatchesSkeleton() {
  return (
    <div className="m-skeleton" aria-busy="true">
      <Row />
      <Row />
      <Row />
      <p className="sr-only" role="status">
        お店を探しています
      </p>
    </div>
  );
}
