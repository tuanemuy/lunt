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
  participationEntryOf,
  participationSearchSchema,
} from "@/presentation/applyRelations";
import { participationHeading } from "@/presentation/applyRelationsView";
import { classifyError } from "@/presentation/errorState";
import { requireLogin } from "@/presentation/session";
import { renderParticipationApply } from "./-render";

/**
 * RQ-06 参加の申請: from SM-06 (`placeId`) and DT-04 (`occasionId`);
 * `?resubmit=` and `?reapply=` from MY-05. Needs a login (CS-04).
 */
export const Route = createFileRoute("/_apply/apply/participation")({
  validateSearch: participationSearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => participationEntryOf(search),
  loader: async ({ deps }) => {
    const { Content } = await renderParticipationApply({ data: deps });
    return { Content };
  },
  head: () => ({ meta: [{ title: "イベントに参加 — Lunt" }] }),
  component: ParticipationPage,
  errorComponent: ParticipationError,
});

function ParticipationPage() {
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
                heading={participationHeading(participationEntryOf(search))}
              />
            }
          >
            <ApplySkeleton
              variant="event"
              label="申請の画面を読み込んでいます"
            />
          </ManagePage>
        }
      />
    </ApplyOutcomeBoundary>
  );
}

function ParticipationError({ error }: ErrorComponentProps) {
  const search = Route.useSearch();
  return (
    <ApplyProblem
      heading={participationHeading(participationEntryOf(search))}
      kind={classifyError(error).kind}
    />
  );
}
