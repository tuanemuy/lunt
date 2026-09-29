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
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { RegionShell } from "@/components/region/RegionShell";
import { ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { requireOperatorFn } from "@/presentation/roles";
import { renderNewRegion } from "./-render";

/**
 * RM-02 新規: a service operator registers a region (REG-12), opened from
 * OM-02. Operators only (CS-05).
 */
export const Route = createFileRoute("/_manage/manage/regions/new")({
  beforeLoad: () => requireOperatorFn(),
  loader: async () => {
    const { Content } = await renderNewRegion();
    return { Content };
  },
  head: () => ({ meta: [{ title: "地域を登録 — Lunt" }] }),
  component: NewRegionPage,
  errorComponent: NewRegionError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageHeading>地域を登録</ManageHeading>
    </ManageTitle>
  );
}

function NewRegionPage() {
  const { Content } = Route.useLoaderData();
  return (
    <RegionShell homeTo="/ops/search">
      <Deferred
        promise={Content}
        fallback={
          <ManagePage title={<Title />}>
            <ShopSkeleton variant="form" label="登録の画面を読み込んでいます" />
          </ManagePage>
        }
      />
    </RegionShell>
  );
}

function NewRegionError({ error }: ErrorComponentProps) {
  return (
    <RegionShell homeTo="/me">
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={<Title />}>
          <ManageBody>
            <EmptyPanel
              title="サービス運営者ではありません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              地域の登録は、サービス運営者だけが行えます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </RegionShell>
  );
}
