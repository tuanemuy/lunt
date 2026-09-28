import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** CS-01 of OM-01, OM-04 and OM-05: a status line, then rows. */
export function OpsInboxSkeleton({ label }: { label: string }) {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="h-25 w-2/5" />
        <Skeleton variant="manage" className="h-48 w-full rounded-8" />
        <Skeleton variant="manage" className="h-25 w-2/5" />
        <Skeleton variant="manage" className="h-88 w-full rounded-8" />
        <Skeleton variant="manage" className="h-88 w-full rounded-8" />
        <Skeleton variant="manage" className="h-25 w-2/5" />
        <Skeleton variant="manage" className="h-88 w-full rounded-8" />
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
    </ManageBody>
  );
}
