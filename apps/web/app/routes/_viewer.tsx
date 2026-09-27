import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import {
  type ViewerHeaderConfig,
  ViewerShell,
  type ViewerTabKey,
} from "@/components/layout/ViewerShell";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The viewer header a screen under `_viewer` shows; the tab screens' home header when unset. */
    viewerHeader?: ViewerHeaderConfig;
    /** The tab a viewer screen belongs to when its URL is not under the tab's path. */
    viewerTab?: ViewerTabKey;
  }
}

const HOME_HEADER: ViewerHeaderConfig = { type: "home" };

export const Route = createFileRoute("/_viewer")({
  component: ViewerLayout,
});

function ViewerLayout() {
  const { header, tab } = useMatches({
    select: (matches) => {
      const leaf = matches.at(-1)?.staticData;
      return { header: leaf?.viewerHeader, tab: leaf?.viewerTab };
    },
    structuralSharing: true,
  });
  return (
    <ViewerShell header={header ?? HOME_HEADER} current={tab}>
      <Outlet />
    </ViewerShell>
  );
}
