import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { requireOperatorFn } from "@/presentation/roles";
import { renderNewPlace } from "./-render";

/**
 * SM-02 新規: the service operator's proxy registration of a store
 * (SHP-12), opened from OM-02. Operators only (CS-05).
 */
export const Route = createFileRoute("/_manage/manage/places/new")({
  beforeLoad: () => requireOperatorFn(),
  loader: async () => {
    const { Content } = await renderNewPlace();
    return { Content };
  },
  head: () => ({ meta: [{ title: "店舗を登録 — Lunt" }] }),
  component: NewPlacePage,
  errorComponent: NewPlaceError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageHeading>店舗を登録</ManageHeading>
    </ManageTitle>
  );
}

function NewPlacePage() {
  const { Content } = Route.useLoaderData();
  return (
    <ShopShell homeTo="/ops/search">
      <Deferred
        promise={Content}
        fallback={
          <ManagePage title={<Title />}>
            <ShopSkeleton variant="form" label="登録の画面を読み込んでいます" />
          </ManagePage>
        }
      />
    </ShopShell>
  );
}

function NewPlaceError({ error }: ErrorComponentProps) {
  return (
    <ShopShell homeTo="/me">
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={<Title />}>
          <ManageBody>
            <EmptyPanel
              title="サービス運営者ではありません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              店舗の代理登録は、サービス運営者だけが行えます。店舗を Lunt
              に載せたいときは、マイページの「店舗を登録・管理する」から始めます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </ShopShell>
  );
}
