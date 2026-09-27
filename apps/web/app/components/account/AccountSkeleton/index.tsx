import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * CS-01 of the account screens (the `m-skeleton` of MY-01 / MY-07): an
 * account band, a section title and rows, shaped like the content it
 * stands in for.
 */
export function AccountSkeleton({ label }: { label: string }) {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="h-64 w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-64 w-full" />
        <Skeleton variant="manage" className="h-64 w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-64 w-full" />
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
    </ManageBody>
  );
}
