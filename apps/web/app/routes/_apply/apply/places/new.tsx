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
import { renderRegistration } from "../-render";

/**
 * RQ-02 店舗の申請 (登録): from RQ-01's 新規店舗の登録; `?resubmit=` and
 * `?reapply=` from MY-05. Needs a login (CS-04).
 */
export const Route = createFileRoute("/_apply/apply/places/new")({
  validateSearch: applySearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => entryOf(search),
  loader: async ({ deps }) => {
    const { Content } = await renderRegistration({ data: deps });
    return { Content };
  },
  head: () => ({ meta: [{ title: "新しいお店を登録 — Lunt" }] }),
  component: RegistrationPage,
  errorComponent: RegistrationError,
});

function heading(resubmit: string | undefined): string {
  return resubmit === undefined ? "新しいお店を登録" : "登録の申請を再提出";
}

function RegistrationPage() {
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
              label="申請の画面を読み込んでいます"
            />
          </ManagePage>
        }
      />
    </ApplyOutcomeBoundary>
  );
}

function RegistrationError({ error }: ErrorComponentProps) {
  const { resubmit } = Route.useSearch();
  return (
    <ApplyProblem
      heading={heading(resubmit)}
      kind={classifyError(error).kind}
    />
  );
}
