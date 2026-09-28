import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SoloShell } from "@/components/layout/ManageShell";

/**
 * The claim and report screens (RQ-07, RQ-08): the management frame
 * labelled 申立て・連絡, leading back to みつける, without a management
 * nav. RQ-07 needs no login and has no マイページ entry.
 */
export const Route = createFileRoute("/_report")({
  component: ReportLayout,
});

function ReportLayout() {
  const accountLink = useLocation({
    select: (location) => !location.pathname.startsWith("/takedown/"),
  });
  return (
    <SoloShell context="申立て・連絡" homeTo="/" accountLink={accountLink}>
      <Outlet />
    </SoloShell>
  );
}
