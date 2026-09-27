import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/ops` is OM-01 (対応が必要なもの), which the MY-01 entry and the operator
 * role's grant notification open. Until OM-01's stage builds it, the area's
 * only screen stands in: OM-01's stage replaces this redirect with the
 * screen. The `_manage/ops` layout has already refused non-operators.
 */
export const Route = createFileRoute("/_manage/ops/")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/roles", replace: true });
  },
});
