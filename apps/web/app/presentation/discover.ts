import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { browseCriteriaOf, browseSearchSchema } from "./browseSearch";
import {
  FEED_MAX_PAGE,
  type FeedPage,
  SEARCH_KIND_ORDER,
  type SearchGroupPage,
} from "./discoverView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { PAGINATION_MAX_PAGE } from "./pagination";
import { validateInput } from "./validator";

/**
 * The viewer's position at the transport boundary: numbers only — the
 * range is `GeoPoint`'s to check (`COMMON_INVALID_GEO_POINT`).
 */
export const originSchema = z
  .object({ latitude: z.number(), longitude: z.number() })
  .nullable();

/** A keyword as typed: bounded against abuse; blank and over-long are `SearchKeyword`'s. */
export const keywordField = z.string().max(1000);

export const feedPageSchema = z.object({
  search: browseSearchSchema,
  origin: originSchema,
  // The feed's depth (`page × limit ≤ 2,000`): a deeper page is refused;
  // the screen ends the feed at the depth instead of asking for it.
  page: z.number().int().min(2).max(FEED_MAX_PAGE),
});

/** VW-01: a further page of the feed (CF-05), with the account's saves among it. */
export const readFeedPageFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(feedPageSchema))
  .handler(async ({ data }): Promise<FeedPage> => {
    const { loadFeedPage } = await import("./discoverData");
    return loadFeedPage(browseCriteriaOf(data.search), data.origin, data.page);
  });

export const searchPageSchema = z.object({
  keyword: keywordField,
  kind: z.enum(SEARCH_KIND_ORDER),
  page: z.number().int().min(2).max(PAGINATION_MAX_PAGE),
});

/** VW-03: a further page of one kind's results (CF-05 per kind). */
export const searchPageFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(searchPageSchema))
  .handler(async ({ data }): Promise<SearchGroupPage> => {
    const { loadSearchPage } = await import("./discoverData");
    return loadSearchPage(data.keyword, data.kind, data.page);
  });
