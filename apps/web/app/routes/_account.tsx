import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ManageShell } from "@/components/layout/ManageShell";

export const Route = createFileRoute("/_account")({
  component: AccountLayout,
});

// マイページ itself (MY-01) and the login screens (MY-02) drop the brand
// band's マイページ entry.
function isAccountEntry(pathname: string): boolean {
  return pathname === "/me" || pathname.startsWith("/login");
}

function AccountLayout() {
  const accountLink = useLocation({
    select: (location) => !isAccountEntry(location.pathname),
  });
  return (
    <ManageShell context="アカウント" homeTo="/" accountLink={accountLink}>
      <Outlet />
    </ManageShell>
  );
}
