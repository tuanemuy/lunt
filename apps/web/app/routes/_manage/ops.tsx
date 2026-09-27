import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { OpsShell } from "@/components/ops/OpsShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { requireOperatorFn } from "@/presentation/roles";

/** The service-operation area (OM): operators only (CS-05). */
export const Route = createFileRoute("/_manage/ops")({
  beforeLoad: () => requireOperatorFn(),
  component: OpsLayout,
  errorComponent: OpsError,
});

function OpsLayout() {
  return (
    <OpsShell>
      <Outlet />
    </OpsShell>
  );
}

/** The area's refusal drawn in its own frame (the layout did not render). */
function OpsError({ error }: ErrorComponentProps) {
  return (
    <OpsShell>
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="サービス運営者ではありません"
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              この画面は、サービス運営者の役割を持つ人だけが開けます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} />
      )}
    </OpsShell>
  );
}
