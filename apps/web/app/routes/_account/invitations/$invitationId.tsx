import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { useTransition } from "react";
import { AccountSkeleton } from "@/components/account/AccountSkeleton";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { InvitationScreen } from "@/components/invitation/InvitationScreen";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { classifyError } from "@/presentation/errorState";
import {
  checkInvitationFn,
  invitationSearchSchema,
} from "@/presentation/invitation";
import { requireLogin } from "@/presentation/session";

/**
 * MY-06 招待の承諾, opened from the invitation mail or MY-03. Needs a login
 * (CS-04): the visitor logs in — with the invited address, which creates
 * the account if there is none — and comes back here.
 */
export const Route = createFileRoute("/_account/invitations/$invitationId")({
  validateSearch: invitationSearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loaderDeps: ({ search }) => ({ kind: search.kind, id: search.id }),
  loader: async ({ params, deps }) => ({
    view: await checkInvitationFn({
      data: {
        invitationId: params.invitationId,
        ...(deps.kind === undefined ? {} : { kind: deps.kind }),
        ...(deps.id === undefined ? {} : { id: deps.id }),
      },
    }),
  }),
  head: () => ({ meta: [{ title: "管理メンバーへの招待 — Lunt" }] }),
  pendingComponent: InvitationPending,
  component: InvitationPage,
  errorComponent: InvitationError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageBackLink to="/me/notifications">通知</ManageBackLink>
      <ManageHeading>管理メンバーへの招待</ManageHeading>
    </ManageTitle>
  );
}

function InvitationPending() {
  return (
    <ManagePage title={<Title />}>
      <AccountSkeleton label="招待を読み込んでいます" />
    </ManagePage>
  );
}

function InvitationPage() {
  const { invitationId } = Route.useParams();
  const { view } = Route.useLoaderData();
  return (
    <InvitationScreen
      key={`${invitationId}:${view.status}`}
      invitationId={invitationId}
      view={view}
    />
  );
}

/** CS-02: the invitation could not be read; retrying reloads the route. */
function InvitationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const state = classifyError(error);
  if (state.kind !== "failed") {
    return <RouteErrorContent problem={{ kind: "error", error }} />;
  }
  return (
    <ManagePage title={<Title />}>
      <ManageBody>
        <Alert
          title="招待を読み込めませんでした"
          actions={
            <Button
              variant="secondary"
              disabled={retrying}
              onClick={() =>
                startRetry(async () => {
                  await router.invalidate({ sync: true });
                })
              }
            >
              {retrying ? "読み込んでいます…" : "もう一度読み込む"}
            </Button>
          }
        >
          通信を確かめて、もう一度読み込んでください。
        </Alert>
      </ManageBody>
    </ManagePage>
  );
}
