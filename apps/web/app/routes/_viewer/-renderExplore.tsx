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

/** VW-06's body for one region and list (see `renderRegions`). */
export const renderRegionList = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionListRenderSchema))
  .handler(async ({ data }) => {
    const { RegionListContent } = await import(
      "@/components/explore/RegionListContent"
    );
    return {
      RegionList: renderServerComponent(
        <RegionListContent regionId={data.regionId} tab={data.tab} />,
      ),
    };
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
