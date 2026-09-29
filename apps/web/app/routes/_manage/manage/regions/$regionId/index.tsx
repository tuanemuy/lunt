import { createFileRoute } from "@tanstack/react-router";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import {
  RegionPage,
  RegionShell,
  regionHomePath,
} from "@/components/region/RegionShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderAffiliations } from "../-render";

/** RM-01 所属店舗と申請. */
export const Route = createFileRoute("/_manage/manage/regions/$regionId/")({
  loader: async ({ params }) => {
    const { Content } = await renderAffiliations({
      data: { regionId: params.regionId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "所属店舗と申請 — Lunt" }] }),
  component: AffiliationsPage,
});

function AffiliationsPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <RegionShell homeTo={regionHomePath(frame.regionId)}>
      <Deferred
        promise={Content}
        fallback={
          <RegionPage frame={frame} heading="所属店舗と申請">
            <ShopSkeleton
              variant="list"
              label="所属店舗と申請を読み込んでいます"
            />
          </RegionPage>
        }
      />
    </RegionShell>
  );
}
