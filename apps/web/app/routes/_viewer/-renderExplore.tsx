import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { browseSearchSchema } from "@/presentation/browseSearch";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

/**
 * VW-05's body for the URL's conditions as an RSC payload, returned
 * unresolved so the loader can forward it and the body streams in under
 * the skeleton.
 */
export const renderRegions = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(browseSearchSchema))
  .handler(async ({ data }) => {
    const { RegionsContent } = await import(
      "@/components/explore/RegionsContent"
    );
    return { Regions: renderServerComponent(<RegionsContent search={data} />) };
  });

export const regionListRenderSchema = z.object({
  regionId: z.string().trim().min(1).max(128),
  tab: z.enum(["places", "listings"]),
});

/**
 * VW-06's body for one region and list (see `renderRegions`), with the
 * region's name for the header — `null` when the region is not viewable
 * (CS-06). The name waits for the region alone; the list still streams.
 */
export const renderRegionList = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionListRenderSchema))
  .handler(async ({ data }) => {
    const [{ RegionListContent }, { loadRegionListHead }] = await Promise.all([
      import("@/components/explore/RegionListContent"),
      import("@/presentation/exploreData"),
    ]);
    const head = loadRegionListHead(data.regionId);
    const RegionList = renderServerComponent(
      <RegionListContent regionId={data.regionId} tab={data.tab} head={head} />,
    );
    return { RegionList, regionName: (await head)?.name ?? null };
  });

/** VW-07's body (see `renderRegions`). */
export const renderEvents = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { EventsContent } = await import(
      "@/components/explore/EventsContent"
    );
    return { Events: renderServerComponent(<EventsContent />) };
  });
