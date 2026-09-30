import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import {
  EditorialShell,
  NotEditorPanel,
} from "@/components/editorial/EditorialShell";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import { requireEditorFn } from "@/presentation/editorial";
import { editorialGuardsRole } from "@/presentation/editorialView";
import { classifyError } from "@/presentation/errorState";

/**
 * The editorial area (AM-01, AM-02, CM-03 of an article): editors only
 * (CS-05); the login is `_manage`'s (CS-04). An article's screens check
 * the role through their read, after the article's existence (CS-17).
 */
export const Route = createFileRoute("/_manage/editorial")({
  beforeLoad: ({ location }) =>
    editorialGuardsRole(location.pathname) ? requireEditorFn() : null,
  component: EditorialLayout,
  errorComponent: EditorialError,
});

function EditorialLayout() {
  return (
    <EditorialShell>
      <Outlet />
    </EditorialShell>
  );
}

/** The area's refusal drawn in its own frame (the layout did not render). */
function EditorialError({ error }: ErrorComponentProps) {
  return (
    <EditorialShell>
      {classifyError(error).kind === "forbidden" ? (
        <NotEditorPanel />
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </EditorialShell>
  );
}
