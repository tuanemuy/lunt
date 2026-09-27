import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** CS-01 of OM-07: a heading and the rows of each role, then the forms. */
export function RoleHoldersSkeleton() {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="h-25 w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-48 w-full rounded-8" />
        <Skeleton variant="manage" className="h-48 w-full rounded-8" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-48 w-full rounded-8" />
      </div>
      <p className="sr-only" role="status">
        役割を読み込んでいます
      </p>
    </ManageBody>
  );
}
