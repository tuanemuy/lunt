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
import { renderNewListingApply } from "../../../-render";

/**
 * RQ-04 掲載の申請 (新しい掲載) of a place without a steward, from DT-02;
 * `?resubmit=` and `?reapply=` from MY-05. The preview (CM-03 without
 * publishing) is the step `?step=preview`, which does not re-run the
 * loader, so the input is kept. Needs a login (CS-04).
 */
export const Route = createFileRoute(
  "/_apply/apply/places/$placeId/listings/new",
)({
  validateSearch: listingApplySearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => entryOf(search),
  loader: async ({ params, deps }) => {
    const { Content } = await renderNewListingApply({
      data: { placeId: params.placeId, ...deps },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "掲載を申請 — Lunt" }] }),
  component: NewListingApplyPage,
  errorComponent: NewListingApplyError,
});

function heading(resubmit: string | undefined): string {
  return resubmit === undefined ? "掲載を申請" : "掲載の申請を再提出";
}

function NewListingApplyPage() {
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
                label="申請の画面を読み込んでいます"
              />
            </ManagePage>
          }
        />
      </ApplyOutcomeBoundary>
    </ListingStepProvider>
  );
}

function NewListingApplyError({ error }: ErrorComponentProps) {
  const { resubmit } = Route.useSearch();
  return (
    <ApplyProblem
      heading={heading(resubmit)}
      kind={classifyError(error).kind}
    />
  );
}
