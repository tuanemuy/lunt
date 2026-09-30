import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { useRecordLeftEntries } from "@/components/explore/entryMemory";
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
    /**
     * A detail header's back destination without history, from the
     * screen's params (e.g. VW-06 back to its region's DT-03), in place of
     * the static `backTo`.
     */
    viewerBackTo?: (params: Readonly<Record<string, string>>) => string;
  }
}

const HOME_HEADER: ViewerHeaderConfig = { type: "home" };

/**
 * A detail header's title named by the screen's loader data
 * (`viewerTitle`, e.g. VW-08's event name) in place of the static one.
 * Only a loaded screen names it: while loading, and on CS-06 / CS-02
 * (a re-read keeps the old data), the static title stays.
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
  useRecordLeftEntries();
  const { header, tab } = useMatches({
    select: (matches) => {
      const leaf = matches.at(-1);
      const header = leaf?.staticData.viewerHeader;
      const title =
        leaf?.status === "success" ? loaderTitle(leaf.loaderData) : undefined;
      const backTo = leaf?.staticData.viewerBackTo?.(leaf.params);
      return {
        header:
          header?.type === "detail"
            ? {
                ...header,
                ...(title === undefined ? {} : { title }),
                ...(backTo === undefined ? {} : { backTo }),
              }
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
