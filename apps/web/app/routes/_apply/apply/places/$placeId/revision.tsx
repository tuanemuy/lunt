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
import { renderPlaceRevision } from "../../-render";

/**
 * RQ-02 店舗の申請 (修正): the information and operating status of a place
 * without a steward, from DT-02; `?resubmit=` and `?reapply=` from MY-05.
 * Needs a login (CS-04).
 */
export const Route = createFileRoute("/_apply/apply/places/$placeId/revision")({
  validateSearch: applySearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => entryOf(search),
  loader: async ({ params, deps }) => {
    const { Content } = await renderPlaceRevision({
      data: { placeId: params.placeId, ...deps },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "お店の情報の修正を申請 — Lunt" }] }),
  component: PlaceRevisionPage,
  errorComponent: PlaceRevisionError,
});

function heading(resubmit: string | undefined): string {
  return resubmit === undefined
    ? "お店の情報の修正を申請"
    : "修正の申請を再提出";
}

function PlaceRevisionPage() {
  const { Content } = Route.useLoaderData();
  const { resubmit, reapply } = Route.useSearch();
  const opened = useLocation({ select: (location) => location.pathname });
  return (
    <ApplyOutcomeBoundary key={`${opened}|${resubmit ?? ""}|${reapply ?? ""}`}>
      <Deferred
        promise={Content}
        fallback={
          <ManagePage title={<ApplyTitle heading={heading(resubmit)} />}>
            <ApplySkeleton
              variant="place"
              label="お店の現在の情報を読み込んでいます"
            />
          </ManagePage>
        }
      />
    </ApplyOutcomeBoundary>
  );
}

function PlaceRevisionError({ error }: ErrorComponentProps) {
  const { resubmit } = Route.useSearch();
  return (
    <ApplyProblem
      heading={heading(resubmit)}
      kind={classifyError(error).kind}
    />
  );
}
