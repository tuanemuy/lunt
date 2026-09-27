import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { ShopShell } from "@/components/manage/ShopShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { loadPlaceFrameFn } from "@/presentation/place";

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

/** The guard refused or failed: CS-05, CS-17, or the common error states. */
function PlaceAreaError({ error }: ErrorComponentProps) {
  const state = classifyError(error);
  return (
    <ShopShell homeTo="/me">
      {state.kind === "forbidden" ? (
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
