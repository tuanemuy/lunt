import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import {
  RegionPage,
  RegionShell,
  regionHomePath,
} from "@/components/region/RegionShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderRegionEditor } from "../-render";

const searchSchema = z.object({
  /** Arrived from RM-02 新規 after registering the draft (CS-13). */
  created: z.literal(true).optional().catch(undefined),
});

/** RM-02 地域情報の編集. */
export const Route = createFileRoute("/_manage/manage/regions/$regionId/info")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    const { Content } = await renderRegionEditor({
      data: { regionId: params.regionId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "地域情報 — Lunt" }] }),
  component: RegionInfoPage,
});

function RegionInfoPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <RegionShell homeTo={regionHomePath(frame.regionId)}>
      <Deferred
        promise={Content}
        fallback={
          <RegionPage frame={frame} heading="地域情報を編集">
            <ShopSkeleton variant="form" label="地域情報を読み込んでいます" />
          </RegionPage>
        }
      />
    </RegionShell>
  );
}
