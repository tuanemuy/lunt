import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** CS-01 of CM-02: the managers, the invitations, then the invitation field. */
export function MembersSkeleton() {
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-44 w-full" />
        <Skeleton variant="manage" className="h-44 w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-44 w-full" />
        <Skeleton variant="manage" className="h-27 w-2/5" />
        <Skeleton variant="manage" className="h-48 w-full rounded-8" />
      </div>
      <p className="sr-only" role="status">
        メンバーを読み込んでいます
      </p>
    </ManageBody>
  );
}
