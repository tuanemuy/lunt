import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { useProxyVisited } from "@/components/ops/ProxyReturn";
import { RegionShell, regionProxyKey } from "@/components/region/RegionShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { loadRegionFrameFn } from "@/presentation/region";
import { REGION_PROXY_UNAVAILABLE } from "@/presentation/regionView";

/**
 * The region management area (RM-01〜RM-03): the region's stewards, or a
 * service operator while it has none (CS-14). The guard's frame names the
 * region in every screen below; each screen draws the shell itself.
 */
export const Route = createFileRoute("/_manage/manage/regions/$regionId")({
  beforeLoad: async ({ params }) => ({
    frame: await loadRegionFrameFn({ data: { regionId: params.regionId } }),
  }),
  component: Outlet,
  errorComponent: RegionAreaError,
});

/**
 * The guard refused or failed: CS-15 (an operator standing in for the
 * region, which has gained a steward), CS-05, CS-17, or the common error
 * states. An operator who did not come as a stand-in (the region's URL
 * opened directly) is refused like anyone else (CS-05).
 */
function RegionAreaError({ error }: ErrorComponentProps) {
  const refused = classifyError(error);
  const { regionId } = Route.useParams();
  const proxied = useProxyVisited(regionProxyKey(regionId));
  const lostProxy =
    refused.kind === "forbidden" &&
    refused.code === REGION_PROXY_UNAVAILABLE &&
    proxied;
  return (
    <RegionShell homeTo="/me">
      {lostProxy ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この地域は代行できません"
              headingLevel="h1"
              actions={
                <ButtonLink
                  to="/ops/subjects/$kind/$id"
                  params={{ kind: "region", id: regionId }}
                >
                  地域の運営へ戻る
                </ButtonLink>
              }
            >
              この地域には地域運営者が就いています。不在の代行はできません。地域の運営の画面で、運営者がいることを確かめてください。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : refused.kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この地域を運営する権限がありません"
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              地域の管理権限を持つ地域だけを開けます。運営する地域は、マイページから選べます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : refused.kind === "notFound" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この地域は見つかりません"
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              地域が削除されたか、存在しない地域です。地域の情報と操作は示せません。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </RegionShell>
  );
}
