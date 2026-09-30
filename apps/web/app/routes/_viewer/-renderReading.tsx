import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";

/**
 * VW-09's body as an RSC payload, returned unresolved so the loader can
 * forward it and the list streams in under the skeleton.
 */
export const renderArticles = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ArticlesContent } = await import(
      "@/components/reading/ArticlesContent"
    );
    return { Articles: renderServerComponent(<ArticlesContent />) };
  });
