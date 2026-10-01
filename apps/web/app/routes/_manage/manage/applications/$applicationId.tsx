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
import { OpsNav } from "@/components/ops/OpsShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { TextLink } from "@/components/ui/TextButton";
import { loadApplicationReviewFn } from "@/presentation/applicationReview";
import { classifyError } from "@/presentation/errorState";
import {
  type ReviewOrigin,
  reviewOriginFrame,
  reviewOriginOf,
  reviewSearchSchema,
} from "@/presentation/reviewOrigin";

/**
 * CM-01 申請の判断. The management layout requires a login (CS-04); the
 * loader returns plain data so that a viewer who is not the approver
 * (CS-05) and a missing application (CS-17) reach the error view
 * classified. The loaded screen draws its frame by who judges
 * (`ReviewFrame`); before the application is read — loading, and the
 * error states — the list it was opened from (`?from=`) names the frame
 * and the way back, and without one the frame is a neutral one.
 */
export const Route = createFileRoute(
  "/_manage/manage/applications/$applicationId",
)({
  validateSearch: reviewSearchSchema,
  loader: ({ params }) =>
    loadApplicationReviewFn({
      data: { applicationId: params.applicationId },
    }),
  head: () => ({ meta: [{ title: "申請の判断 — Lunt" }] }),
  pendingComponent: ReviewPending,
  component: ReviewPage,
  errorComponent: ReviewError,
});

function Frame({
  origin,
  children,
}: {
  origin: ReviewOrigin | null;
  children: ReactNode;
}) {
  const { context, back } = reviewOriginFrame(origin);
  const nav = origin?.kind === "ops";
  return (
    <ManageShell context={context} homeTo={back?.to ?? "/me"} solo={!nav}>
      <ManagePage
        title={
          <ManageTitle>
            {back === null ? null : (
              <TextLink to={back.to} className="cm01-back">
                {back.label}
              </TextLink>
            )}
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

function useOrigin(): ReviewOrigin | null {
  return reviewOriginOf(Route.useSearch());
}

/** Framed by the list it was opened from until the application is read. */
function ReviewPending() {
  return (
    <Frame origin={useOrigin()}>
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
  const origin = useOrigin();
  const { context, back } = reviewOriginFrame(origin);
  const state = classifyError(error);
  switch (state.kind) {
    case "loginRequired":
      return (
        <ManageShell context={context} homeTo="/me" solo>
          <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
        </ManageShell>
      );
    case "forbidden":
      // Not the approver: the list named by `?from=` may be one the viewer
      // cannot open either (another region's RM-01), so the frame is the
      // neutral one and the way back is MY-01 (CS-05).
      return (
        <Frame origin={null}>
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
      // Without the application only `?from=` names the list it came from
      // (OM-01, RM-01, EM-01); otherwise MY-01 leads to each of them.
      return (
        <Frame origin={origin}>
          <ManageBody>
            <EmptyPanel
              title="申請が見つかりません"
              actions={
                back === null ? (
                  <>
                    <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                    <ButtonLink variant="secondary" to="/me/notifications">
                      通知へ戻る
                    </ButtonLink>
                  </>
                ) : (
                  <ButtonLink to={back.to}>{back.label}</ButtonLink>
                )
              }
            >
              {back === null
                ? "開いた申請はありません。マイページから申請の一覧（対応が必要なもの、所属店舗と申請、参加店舗と申請）を開き、もう一度選んでください。"
                : "開いた申請はありません。申請の一覧から、もう一度選んでください。"}
            </EmptyPanel>
          </ManageBody>
        </Frame>
      );
    default:
      return (
        <Frame origin={origin}>
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
