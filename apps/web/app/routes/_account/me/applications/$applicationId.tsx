import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { useTransition } from "react";
import { ApplicationDetailSkeleton } from "@/components/application/ApplicationSkeleton";
import { MyApplicationView } from "@/components/application/MyApplicationView";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { loadMyApplicationFn } from "@/presentation/myApplicationDetail";
import { requireLogin } from "@/presentation/session";

/**
 * MY-05 申請の詳細. Needs a login (CS-04). The loader returns plain data
 * so that someone else's application (CS-05) and a missing one (CS-06)
 * reach the error view classified; the skeleton covers the load (CS-01).
 */
export const Route = createFileRoute(
  "/_account/me/applications/$applicationId",
)({
  beforeLoad: ({ location }) => requireLogin(location),
  loader: ({ params }) =>
    loadMyApplicationFn({
      data: { applicationId: params.applicationId },
    }),
  head: () => ({ meta: [{ title: "申請の詳細 — Lunt" }] }),
  pendingComponent: MyApplicationPending,
  component: MyApplicationPage,
  errorComponent: MyApplicationError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageBackLink to="/me/applications">自分の申請</ManageBackLink>
      <ManageHeading>申請の詳細</ManageHeading>
    </ManageTitle>
  );
}

function MyApplicationPending() {
  return (
    <ManagePage title={<Title />}>
      <ApplicationDetailSkeleton />
    </ManagePage>
  );
}

function MyApplicationPage() {
  const data = Route.useLoaderData();
  return <MyApplicationView key={data.id} data={data} />;
}

function Problem({ title, children }: { title: string; children: string }) {
  return (
    <ManagePage title={<Title />}>
      <ManageBody>
        <EmptyPanel
          title={title}
          actions={
            <>
              <ButtonLink to="/me/applications">
                自分の申請の一覧へ戻る
              </ButtonLink>
              <ButtonLink variant="secondary" to="/me/notifications">
                通知へ戻る
              </ButtonLink>
            </>
          }
        >
          {children}
        </EmptyPanel>
      </ManageBody>
    </ManagePage>
  );
}

/** CS-05, CS-06 (with the way back to MY-04), CS-02 with retry. */
function MyApplicationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const state = classifyError(error);
  switch (state.kind) {
    case "loginRequired":
      return <RouteErrorContent problem={{ kind: "error", error }} />;
    case "forbidden":
      return (
        <Problem title="この申請は見られません">
          ほかの利用者の申請か、管理権限を持たない店舗の申請です。申請の内容は表示できません。
        </Problem>
      );
    case "notFound":
      return (
        <Problem title="この申請は見つかりません">
          開いた申請はありません。自分の申請は、一覧から確かめられます。
        </Problem>
      );
    default:
      return (
        <ManagePage title={<Title />}>
          <ManageBody>
            <Alert
              title="申請を読み込めませんでした"
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
}
