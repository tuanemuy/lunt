import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { useTransition } from "react";
import { AccountSkeleton } from "@/components/account/AccountSkeleton";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { classifyError } from "@/presentation/errorState";
import { requireLogin } from "@/presentation/session";
import { renderNotifications } from "./-render";

/** MY-03 通知一覧. Needs a login (CS-04). */
export const Route = createFileRoute("/_account/me/notifications")({
  beforeLoad: ({ location }) => requireLogin(location),
  loader: async () => {
    const { Notifications } = await renderNotifications();
    return { Notifications };
  },
  head: () => ({ meta: [{ title: "通知 — Lunt" }] }),
  component: NotificationsPage,
  errorComponent: NotificationsError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageBackLink to="/me">マイページ</ManageBackLink>
      <ManageHeading>通知</ManageHeading>
    </ManageTitle>
  );
}

function NotificationsPage() {
  const { Notifications } = Route.useLoaderData();
  return (
    <ManagePage title={<Title />}>
      <Deferred
        promise={Notifications}
        fallback={<AccountSkeleton label="通知を読み込んでいます" />}
      />
    </ManagePage>
  );
}

/** CS-02: the list could not be read; retrying reloads the route. */
function NotificationsError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const state = classifyError(error);
  if (state.kind === "loginRequired" || state.kind === "forbidden") {
    return <RouteErrorContent problem={{ kind: "error", error }} />;
  }
  return (
    <ManagePage title={<Title />}>
      <ManageBody>
        <Alert
          title="通知を読み込めませんでした"
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
