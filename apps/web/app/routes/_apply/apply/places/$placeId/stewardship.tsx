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
import { applySearchSchema, entryOf } from "@/presentation/apply";
import { classifyError } from "@/presentation/errorState";
import { requireLogin } from "@/presentation/session";
import { renderStewardship } from "../../-render";

/**
 * RQ-03 管理権限の申請: from DT-02's 「このお店を管理する」; `?resubmit=`
 * and `?reapply=` from MY-05 (a claim filed with a registration names the
 * registration's reserved place). Needs a login (CS-04).
 */
export const Route = createFileRoute(
  "/_apply/apply/places/$placeId/stewardship",
)({
  validateSearch: applySearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => entryOf(search),
  loader: async ({ params, deps }) => {
    const { Content } = await renderStewardship({
      data: { placeId: params.placeId, ...deps },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "お店の管理を申請 — Lunt" }] }),
  component: StewardshipPage,
  errorComponent: StewardshipError,
});

function heading(resubmit: string | undefined): string {
  return resubmit === undefined ? "お店の管理を申請" : "管理権限の申請を再提出";
}

function StewardshipPage() {
  const { Content } = Route.useLoaderData();
  const { resubmit, reapply } = Route.useSearch();
  const opened = useLocation({ select: (location) => location.pathname });
  return (
    <ApplyOutcomeBoundary key={`${opened}|${resubmit ?? ""}|${reapply ?? ""}`}>
      <Deferred
        promise={Content}
        fallback={
          <ManagePage title={<ApplyTitle heading={heading(resubmit)} />}>
            <ApplySkeleton variant="claim" label="読み込んでいます" />
          </ManagePage>
        }
      />
    </ApplyOutcomeBoundary>
  );
}

function StewardshipError({ error }: ErrorComponentProps) {
  const { resubmit } = Route.useSearch();
  return (
    <ApplyProblem
      heading={heading(resubmit)}
      kind={classifyError(error).kind}
    />
  );
}
