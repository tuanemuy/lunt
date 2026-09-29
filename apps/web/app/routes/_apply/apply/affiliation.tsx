import {
  createFileRoute,
  type ErrorComponentProps,
  useLocation,
} from "@tanstack/react-router";
import { ApplyOutcomeBoundary } from "@/components/apply/ApplyOutcome";
import { ApplyProblem, ApplyTitle } from "@/components/apply/ApplyParts";
import { ApplySkeleton } from "@/components/apply/ApplySkeleton";
import { ManagePage } from "@/components/layout/ManageShell";
import { Deferred } from "@/components/ui/Deferred";
import {
  membershipEntryOf,
  membershipSearchSchema,
} from "@/presentation/applyRelations";
import { membershipHeading } from "@/presentation/applyRelationsView";
import { classifyError } from "@/presentation/errorState";
import { requireLogin } from "@/presentation/session";
import { renderMembershipApply } from "./-render";

/**
 * RQ-05 所属・離脱の申請: from SM-05 (`placeId`, `mode`, and the region to
 * leave), DT-02 (`placeId`) and DT-03 (`regionId`); `?resubmit=` and
 * `?reapply=` from MY-05. Needs a login (CS-04).
 */
export const Route = createFileRoute("/_apply/apply/affiliation")({
  validateSearch: membershipSearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => membershipEntryOf(search),
  loader: async ({ deps }) => {
    const { Content } = await renderMembershipApply({ data: deps });
    return { Content };
  },
  head: () => ({ meta: [{ title: "所属・離脱を申請 — Lunt" }] }),
  component: MembershipPage,
  errorComponent: MembershipError,
});

function MembershipPage() {
  const { Content } = Route.useLoaderData();
  const search = Route.useSearch();
  const opened = useLocation({ select: (location) => location.searchStr });
  return (
    <ApplyOutcomeBoundary key={opened}>
      <Deferred
        promise={Content}
        fallback={
          <ManagePage
            title={
              <ApplyTitle
                heading={membershipHeading(membershipEntryOf(search))}
              />
            }
          >
            <ApplySkeleton
              variant="claim"
              label="申請の画面を読み込んでいます"
            />
          </ManagePage>
        }
      />
    </ApplyOutcomeBoundary>
  );
}

function MembershipError({ error }: ErrorComponentProps) {
  const search = Route.useSearch();
  return (
    <ApplyProblem
      heading={membershipHeading(membershipEntryOf(search))}
      kind={classifyError(error).kind}
    />
  );
}
