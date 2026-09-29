import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { regionRefSchema } from "@/presentation/region";
import { validateInput } from "@/presentation/validator";

// The RM screens' bodies as RSC payloads, returned unresolved so each
// loader can forward them and the body streams in under its skeleton.
// These endpoints can be called without the area's guard, so every body's
// loader repeats the management check (`regionData.ts`); the bodies render
// their own CS-17 / CS-05 / CS-15.

/** RM-01. */
export const renderAffiliations = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionRefSchema))
  .handler(async ({ data }) => {
    const { AffiliationsContent } = await import(
      "@/components/region/AffiliationsContent"
    );
    return {
      Content: renderServerComponent(
        <AffiliationsContent regionId={data.regionId} />,
      ),
    };
  });

/** RM-02 (編集). */
export const renderRegionEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionRefSchema))
  .handler(async ({ data }) => {
    const { RegionEditorContent } = await import(
      "@/components/region/RegionEditorContent"
    );
    return {
      Content: renderServerComponent(
        <RegionEditorContent regionId={data.regionId} />,
      ),
    };
  });

/** RM-02 (新規). */
export const renderNewRegion = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { NewRegionContent } = await import(
      "@/components/region/RegionEditorContent"
    );
    return { Content: renderServerComponent(<NewRegionContent />) };
  });

/** RM-03. */
export const renderRegionLinks = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionRefSchema))
  .handler(async ({ data }) => {
    const { RegionLinksContent } = await import(
      "@/components/region/RegionLinksContent"
    );
    return {
      Content: renderServerComponent(
        <RegionLinksContent regionId={data.regionId} />,
      ),
    };
  });
