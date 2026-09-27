import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SoloShell } from "@/components/layout/ManageShell";

/**
 * The store-side request screens (RQ-01…RQ-06): the management frame
 * labelled お店の管理, without a management nav. Each screen decides
 * whether it needs a login (RQ-01 does not).
 */
export const Route = createFileRoute("/_apply")({
  component: ApplyLayout,
});

function ApplyLayout() {
  return (
    <SoloShell context="お店の管理" homeTo="/me">
      <Outlet />
    </SoloShell>
  );
}
