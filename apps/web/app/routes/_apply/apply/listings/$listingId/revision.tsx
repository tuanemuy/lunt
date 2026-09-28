import {
  createFileRoute,
  type ErrorComponentProps,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { ApplyOutcomeBoundary } from "@/components/apply/ApplyOutcome";
import { ApplyProblem, ApplyTitle } from "@/components/apply/ApplyParts";
import { ApplySkeleton } from "@/components/apply/ApplySkeleton";
import { ListingStepProvider } from "@/components/apply/ListingStep";
import { ManagePage } from "@/components/layout/ManageShell";
import { Deferred } from "@/components/ui/Deferred";
import { entryOf, listingApplySearchSchema } from "@/presentation/apply";
import { classifyError } from "@/presentation/errorState";
import { requireLogin } from "@/presentation/session";
import { renderListingRevisionApply } from "../../-render";

/**
 * RQ-04 掲載の申請 (修正) of a published listing of a place without a
 * steward, from DT-01; `?resubmit=` and `?reapply=` from MY-05. The
 * preview is the step `?step=preview` (the input is kept). Needs a login
 * (CS-04).
 */
export const Route = createFileRoute(
  "/_apply/apply/listings/$listingId/revision",
)({
  validateSearch: listingApplySearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => entryOf(search),
  loader: async ({ params, deps }) => {
    const { Content } = await renderListingRevisionApply({
      data: { listingId: params.listingId, ...deps },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "掲載の修正を申請 — Lunt" }] }),
  component: ListingRevisionApplyPage,
  errorComponent: ListingRevisionApplyError,
});

function heading(resubmit: string | undefined): string {
  return resubmit === undefined
    ? "掲載の修正を申請"
    : "掲載の修正の申請を再提出";
}

function ListingRevisionApplyPage() {
  const { Content } = Route.useLoaderData();
  const { resubmit, reapply, step } = Route.useSearch();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = Route.useNavigate();
  const router = useRouter();
  const opened = useRef(false);
  const value = useMemo(
    () => ({
      step: step ?? ("input" as const),
      openPreview: () => {
        opened.current = true;
        void navigate({ search: (prev) => ({ ...prev, step: "preview" }) });
      },
      closePreview: () => {
        if (opened.current) {
          opened.current = false;
          router.history.back();
          return;
        }
        void navigate({
          search: ({ step: _step, ...rest }) => rest,
          replace: true,
        });
      },
    }),
    [step, navigate, router],
  );
  return (
    <ListingStepProvider value={value}>
      <ApplyOutcomeBoundary
        key={`${pathname}|${resubmit ?? ""}|${reapply ?? ""}`}
      >
        <Deferred
          promise={Content}
          fallback={
            <ManagePage title={<ApplyTitle heading={heading(resubmit)} />}>
              <ApplySkeleton
                variant="listing"
                label="掲載の現在の内容を読み込んでいます"
              />
            </ManagePage>
          }
        />
      </ApplyOutcomeBoundary>
    </ListingStepProvider>
  );
}

function ListingRevisionApplyError({ error }: ErrorComponentProps) {
  const { resubmit } = Route.useSearch();
  return (
    <ApplyProblem
      heading={heading(resubmit)}
      kind={classifyError(error).kind}
    />
  );
}
