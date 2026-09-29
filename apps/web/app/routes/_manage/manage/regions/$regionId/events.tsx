import { createFileRoute } from "@tanstack/react-router";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import {
  RegionPage,
  RegionShell,
  regionHomePath,
} from "@/components/region/RegionShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderRegionLinks } from "../-render";

/** RM-03 関連づけられたイベント. */
export const Route = createFileRoute(
  "/_manage/manage/regions/$regionId/events",
)({
  loader: async ({ params }) => {
    const { Content } = await renderRegionLinks({
      data: { regionId: params.regionId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "関連づけられたイベント — Lunt" }] }),
  component: RegionLinksPage,
});

function RegionLinksPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <RegionShell homeTo={regionHomePath(frame.regionId)}>
      <Deferred
        promise={Content}
        fallback={
          <RegionPage frame={frame} heading="関連づけられたイベント">
            <ShopSkeleton
              variant="list"
              label="関連づけられたイベントを読み込んでいます"
            />
          </RegionPage>
        }
      />
    </RegionShell>
  );
}
