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

/**
 * A detail header's title named by the screen's loader data
 * (`viewerTitle`, e.g. VW-08's event name) in place of the static one.
 */
function loaderTitle(data: unknown): string | undefined {
  return typeof data === "object" &&
    data !== null &&
    "viewerTitle" in data &&
    typeof data.viewerTitle === "string"
    ? data.viewerTitle
    : undefined;
}

export const Route = createFileRoute("/_viewer")({
  component: ViewerLayout,
});

function ViewerLayout() {
  const { header, tab } = useMatches({
    select: (matches) => {
      const leaf = matches.at(-1);
      const header = leaf?.staticData.viewerHeader;
      const title = loaderTitle(leaf?.loaderData);
      return {
        header:
          header?.type === "detail" && title !== undefined
            ? { ...header, title }
            : header,
        tab: leaf?.staticData.viewerTab,
      };
    },
    structuralSharing: true,
  });
  return (
    <ViewerShell header={header ?? HOME_HEADER} current={tab}>
      <Outlet />
    </ViewerShell>
  );
}
