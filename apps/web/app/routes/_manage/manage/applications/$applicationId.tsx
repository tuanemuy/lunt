import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { ApplicationReviewView } from "@/components/application/ApplicationReviewView";
import { ApplicationDetailSkeleton } from "@/components/application/ApplicationSkeleton";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OPS_HOME, OpsNav } from "@/components/ops/OpsShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { TextLink } from "@/components/ui/TextButton";
import { loadApplicationReviewFn } from "@/presentation/applicationReview";
import { classifyError } from "@/presentation/errorState";

/**
 * CM-01 申請の判断. The management layout requires a login (CS-04); the
 * loader returns plain data so that a viewer who is not the approver
 * (CS-05) and a missing application (CS-17) reach the error view
 * classified. The loaded screen draws its frame by who judges
 * (`ReviewFrame`); before the application is read — loading, and the
 * error states — the frame is the service-operation one.
 */
export const Route = createFileRoute(
  "/_manage/manage/applications/$applicationId",
)({
  loader: ({ params }) =>
    loadApplicationReviewFn({
      data: { applicationId: params.applicationId },
    }),
  head: () => ({ meta: [{ title: "申請の判断 — Lunt" }] }),
  pendingComponent: ReviewPending,
  component: ReviewPage,
  errorComponent: ReviewError,
});

function Frame({ nav, children }: { nav: boolean; children: ReactNode }) {
  return (
    <ManageShell
      context="サービス運営"
      homeTo={nav ? OPS_HOME : "/me"}
      solo={!nav}
    >
      <ManagePage
        title={
          <ManageTitle>
            {nav ? (
              <TextLink to={OPS_HOME} className="cm01-back">
                対応が必要なものへ戻る
              </TextLink>
            ) : null}
            <ManageHeading>申請の判断</ManageHeading>
          </ManageTitle>
        }
        {...(nav ? { nav: <OpsNav /> } : {})}
      >
        {children}
      </ManagePage>
    </ManageShell>
  );
}

/**
 * Who opened it is not known until the application is read (a region's or
 * event's steward is framed in its own nav): no nav meanwhile.
 */
function ReviewPending() {
  return (
    <Frame nav={false}>
      <ApplicationDetailSkeleton />
    </Frame>
  );
}

function ReviewPage() {
  const data = Route.useLoaderData();
  return <ApplicationReviewView key={data.id} data={data} />;
}

/** CS-05 (not its approver), CS-17 (no such application), CS-02 with retry. */
function ReviewError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const state = classifyError(error);
  switch (state.kind) {
    case "loginRequired":
      return (
        <ManageShell context="サービス運営" homeTo="/me" solo>
          <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
        </ManageShell>
      );
    case "forbidden":
      return (
        <Frame nav={false}>
          <ManageBody>
            <EmptyPanel
              title="この申請の承認者ではありません"
              actions={
                <>
                  <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                  <ButtonLink variant="secondary" to="/me/notifications">
                    通知へ戻る
                  </ButtonLink>
                </>
              }
            >
              申請の判断は、その申請の承認者だけが行えます。管理する店舗・地域・イベントは、マイページから開けます。
            </EmptyPanel>
          </ManageBody>
        </Frame>
      );
    case "notFound":
      // The list it came from (OM-01, RM-01, EM-01) is not known without
      // the application: MY-01 leads to each of them.
      return (
        <Frame nav={false}>
          <ManageBody>
            <EmptyPanel
              title="申請が見つかりません"
              actions={
                <>
                  <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                  <ButtonLink variant="secondary" to="/me/notifications">
                    通知へ戻る
                  </ButtonLink>
                </>
              }
            >
              開いた申請はありません。マイページから申請の一覧（対応が必要なもの、所属店舗と申請、参加店舗と申請）を開き、もう一度選んでください。
            </EmptyPanel>
          </ManageBody>
        </Frame>
      );
    default:
      return (
        <Frame nav>
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
        </Frame>
      );
  }
}
