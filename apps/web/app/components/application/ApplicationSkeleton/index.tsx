import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** CS-01 of MY-04: a lead line and application rows. */
export function ApplicationListSkeleton() {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="h-27 w-full" />
        <Skeleton variant="manage" className="my-skel-row w-full" />
        <Skeleton variant="manage" className="my-skel-row w-full" />
        <Skeleton variant="manage" className="my-skel-row w-full" />
        <Skeleton variant="manage" className="my-skel-row w-full" />
      </div>
      <p className="sr-only" role="status">
        申請を読み込んでいます
      </p>
    </ManageBody>
  );
}

/** CS-01 of MY-05 and CM-01: a notice, a heading, item rows and the content block. */
export function ApplicationDetailSkeleton() {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="my-skel-row w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="cm01-skel-row w-full" />
        <Skeleton variant="manage" className="cm01-skel-row w-full" />
        <Skeleton variant="manage" className="cm01-skel-row w-full" />
        <Skeleton variant="manage" className="my-skel-block w-full" />
      </div>
      <p className="sr-only" role="status">
        申請を読み込んでいます
      </p>
    </ManageBody>
  );
}
