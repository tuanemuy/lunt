import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  useSearch,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { OpsShell } from "@/components/ops/OpsShell";
import { forgetProxyVisits } from "@/components/ops/ProxyReturn";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { requireOpsAccessFn } from "@/presentation/roles";

/**
 * The service-operation area (OM): operators only (CS-05); a screen about
 * a target that does not exist is CS-17 for anyone.
 */
export const Route = createFileRoute("/_manage/ops")({
  beforeLoad: ({ location }) =>
    requireOpsAccessFn({ data: { path: location.pathname } }),
  component: OpsLayout,
  errorComponent: OpsError,
});

function OpsLayout() {
  useEffect(() => forgetProxyVisits(), []);
  return (
    <OpsShell>
      <Outlet />
    </OpsShell>
  );
}

/**
 * The area's refusal drawn in its own frame (the layout did not render);
 * after revoking one's own role on OM-07, worded for that (CS-05).
 */
function OpsError({ error }: ErrorComponentProps) {
  const revokedSelf = useSearch({
    strict: false,
    select: (search) => search.revoked === "self",
  });
  return (
    <OpsShell>
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title={
                revokedSelf
                  ? "サービス運営者の役割を解除しました"
                  : "サービス運営者ではありません"
              }
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              {revokedSelf
                ? "あなたはサービス運営者ではなくなったため、サービス運営の画面は操作できません。マイページには、運営の入口が示されなくなります。"
                : "この画面は、サービス運営者の役割を持つ人だけが開けます。"}
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} />
      )}
    </OpsShell>
  );
}
