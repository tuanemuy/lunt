import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import {
  browseCriteriaOf,
  browseSearchSchema,
} from "@/presentation/browseSearch";
import { keywordField, originSchema } from "@/presentation/discover";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

const feedSchema = z.object({
  search: browseSearchSchema,
  origin: originSchema,
});

/**
 * VW-01: the feed for the conditions and the viewer's position, as an RSC
 * payload returned unresolved so it streams in under the skeleton.
 */
export const renderFeed = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(feedSchema))
  .handler(async ({ data }) => {
    const { DiscoverFeedContent } = await import(
      "@/components/discover/DiscoverFeedContent"
    );
    return {
      Feed: renderServerComponent(
        <DiscoverFeedContent
          search={data.search}
          criteria={browseCriteriaOf(data.search)}
          origin={data.origin}
        />,
      ),
    };
  });

/**
 * VW-03: the results for `keyword`. The keyword is checked here, before
 * the stream starts (`SearchKeyword.create`), so an over-long one reaches
 * the route as `COMMON_INVALID_SEARCH_KEYWORD` rather than a redacted
 * render error.
 */
export const renderSearch = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ keyword: keywordField })))
  .handler(async ({ data }) => {
    const [{ SearchKeyword }, { SearchResultsContent }] = await Promise.all([
      import("@repo/core/domain/common/searchKeyword"),
      import("@/components/discover/SearchResultsContent"),
    ]);
    SearchKeyword.create(data.keyword);
    return {
      Results: renderServerComponent(
        <SearchResultsContent keyword={data.keyword} />,
      ),
    };
  });

/** VW-02: the conditions as they stand, the prefectures and the categories. */
export const renderFilter = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(browseSearchSchema))
  .handler(async ({ data }) => {
    const { FilterContent } = await import(
      "@/components/discover/FilterContent"
    );
    return {
      Filter: renderServerComponent(
        <FilterContent criteria={browseCriteriaOf(data)} />,
      ),
    };
  });
