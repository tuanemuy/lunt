import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { ManageShell } from "@/components/layout/ManageShell";
import { requireLogin } from "@/presentation/session";

/**
 * The management screens (SM・RM・EM・OM・CM・AM): all need a login
 * (CS-04). Each area's layout below draws its own shell and checks its
 * own authority (CS-05).
 */
export const Route = createFileRoute("/_manage")({
  beforeLoad: ({ location }) => requireLogin(location),
  component: Outlet,
  errorComponent: ManageError,
});

const AREA_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["/ops", "サービス運営"],
  ["/manage/places", "お店の管理"],
  ["/editorial", "読みもの編集"],
];

/**
 * The login check itself failed (e.g. offline, CS-02): no area layout has
 * drawn its frame, so this draws a management one around the state.
 */
function ManageError({ error }: ErrorComponentProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const label =
    AREA_LABELS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "管理";
  return (
    <ManageShell context={label} homeTo="/me" solo>
      <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
    </ManageShell>
  );
}
