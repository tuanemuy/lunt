import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { ShopShell } from "@/components/manage/ShopShell";
import { useProxyVisited } from "@/components/ops/ProxyReturn";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { infoReportPath } from "@/presentation/applyView";
import { classifyError } from "@/presentation/errorState";
import { loadPlaceFrameFn } from "@/presentation/place";
import {
  PLACE_NOT_MANAGED,
  PLACE_PROXY_UNAVAILABLE,
} from "@/presentation/placeView";

/**
 * The store management area (SM, and CM-03 of the store's listings): the
 * store's stewards, or a service operator while it has none (CS-14). The
 * guard's frame names the store in every screen below; each screen draws
 * the shell itself, so a screen of another area (CM-02) may draw its own.
 */
export const Route = createFileRoute("/_manage/manage/places/$placeId")({
  beforeLoad: async ({ params }) => ({
    frame: await loadPlaceFrameFn({ data: { placeId: params.placeId } }),
  }),
  component: Outlet,
  errorComponent: PlaceAreaError,
});

/**
 * SM-02's CS-05 for a stranger to a store viewers can see: its DT-02, and
 * the store's RQ-08 when it has a steward or its RQ-02 revision when it
 * has none (SHP-06, SHP-07).
 */
function NotStewardOfPlace({
  placeId,
  vacant,
}: {
  placeId: string;
  vacant: boolean;
}) {
  return (
    <EmptyPanel
      title="この店舗の店舗管理者ではありません"
      headingLevel="h1"
      actions={
        <>
          {vacant ? (
            <ButtonLink
              to="/apply/places/$placeId/revision"
              params={{ placeId }}
            >
              情報の修正を申請する
            </ButtonLink>
          ) : (
            <ButtonLink to={infoReportPath("place", placeId)}>
              情報の誤り・閉店を連絡する
            </ButtonLink>
          )}
          <ButtonLink
            variant="secondary"
            to="/places/$placeId"
            params={{ placeId }}
          >
            店舗ページを見る
          </ButtonLink>
        </>
      }
    >
      {vacant
        ? "この店舗には店舗管理者がいません。情報の修正と営業状況の変更は、申請して運営の確認を受けます。"
        : "この店舗の店舗情報は、店舗管理者だけが編集できます。情報の誤りや閉店に気づいたときは、運営に連絡できます。"}
    </EmptyPanel>
  );
}

/**
 * The guard refused or failed: CS-15 (an operator standing in for the
 * store, which has gained a steward), CS-05, CS-17, or the common error
 * states. An operator who did not come as a stand-in (the store's URL
 * opened directly) is refused like any non-steward (CS-05).
 */
function PlaceAreaError({ error }: ErrorComponentProps) {
  const refused = classifyError(error);
  const { placeId } = Route.useParams();
  const proxied = useProxyVisited(placeId);
  const state =
    refused.kind === "forbidden" &&
    refused.code === PLACE_PROXY_UNAVAILABLE &&
    !proxied
      ? { ...refused, code: PLACE_NOT_MANAGED.stewarded }
      : refused;
  const matchRoute = useMatchRoute();
  const onPlaceInfo =
    matchRoute({ to: "/manage/places/$placeId/info", params: { placeId } }) !==
    false;
  return (
    <ShopShell homeTo="/me">
      {state.kind === "forbidden" && state.code === PLACE_PROXY_UNAVAILABLE ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この店舗は代行できません"
              headingLevel="h1"
              actions={
                <ButtonLink
                  to="/ops/subjects/$kind/$id"
                  params={{ kind: "place", id: placeId }}
                >
                  店舗の運営へ戻る
                </ButtonLink>
              }
            >
              この店舗には店舗管理者が就いています。不在の代行はできません。店舗の運営の画面で、管理者がいることを確かめてください。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : state.kind === "forbidden" &&
        onPlaceInfo &&
        (state.code === PLACE_NOT_MANAGED.vacant ||
          state.code === PLACE_NOT_MANAGED.stewarded) ? (
        <ManagePage title={null}>
          <ManageBody>
            <NotStewardOfPlace
              placeId={placeId}
              vacant={state.code === PLACE_NOT_MANAGED.vacant}
            />
          </ManageBody>
        </ManagePage>
      ) : state.kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この店舗を管理する権限がありません"
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              店舗管理者と、店舗管理者のいない店舗を代行するサービス運営者だけが開けます。管理する店舗は、マイページから選べます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : state.kind === "notFound" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="店舗が見つかりません"
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              存在しない店舗です。マイページから、管理する店舗を開き直してください。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </ShopShell>
  );
}
