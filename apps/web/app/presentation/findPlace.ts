import type { PlaceMatch } from "@repo/core/application/place/matchPlaces";
import { Address } from "@repo/core/domain/common/address";
import type { PaginationResult } from "@repo/core/domain/common/pagination";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { PAGINATION_MAX_PAGE } from "./pagination";
import type { PhotoSource } from "./photoFraming";
import { validateInput } from "./validator";

/**
 * RQ-01 店舗を探す (`spec/pages/request.md`): 名称・所在地で既存の店舗を探す
 * (`spec/scenario/index.md` 「探し方」), in the reference scene. Needs no login.
 */

/** Longest term accepted from the URL or the form. */
export const MATCH_TERM_MAX = 100;

const term = z
  .string()
  .trim()
  .max(MATCH_TERM_MAX)
  .transform((value) => (value === "" ? undefined : value));

/** The URL's `name` / `address`: blank, too long or malformed reads as not entered. */
export const findPlaceSearchSchema = z.object({
  name: term.optional().catch(undefined),
  address: term.optional().catch(undefined),
});

export type FindPlaceSearch = z.infer<typeof findPlaceSearchSchema>;

/** One found place: name, address, photo and — reference scene — its operating status. */
export type PlaceMatchItem = Readonly<{
  placeId: string;
  name: string;
  address: string;
  operating: OperatingStatus;
  /** The place's first photo, or a listing's standing in; `null` when neither. */
  photo: PhotoSource | null;
}>;

/** A page of RQ-01's results, or why nothing could be searched (CS-10). */
export type PlaceMatchPage =
  | Readonly<{
      kind: "results";
      items: readonly PlaceMatchItem[];
      count: number;
    }>
  | Readonly<{ kind: "invalid" }>;

/** Results per page (CF-05 loads the next as the list is read). */
export const PLACE_MATCH_PAGE_SIZE = 20;

export function toPlaceMatchPage(
  result: PaginationResult<PlaceMatch>,
): PlaceMatchPage {
  return {
    kind: "results",
    count: result.count,
    items: result.items.map((match) => ({
      placeId: match.placeId,
      name: match.name,
      address: Address.text(match.address),
      operating: match.operatingStatus,
      photo:
        match.cover === null
          ? null
          : {
              src: match.cover.displayRef.url,
              framing:
                match.cover.framing === null
                  ? null
                  : {
                      x: match.cover.framing.x,
                      y: match.cover.framing.y,
                      width: match.cover.framing.width,
                      height: match.cover.framing.height,
                    },
            },
    })),
  };
}

export const matchPlacesSchema = z.object({
  name: z.string().max(MATCH_TERM_MAX).nullable(),
  address: z.string().max(MATCH_TERM_MAX).nullable(),
  page: z.number().int().min(1).max(PAGINATION_MAX_PAGE),
});

/** RQ-01's results, continued (CF-05). */
export const matchPlacesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(matchPlacesSchema))
  .handler(async ({ data }): Promise<PlaceMatchPage> => {
    const { loadPlaceMatches } = await import("./findPlaceData");
    return loadPlaceMatches(data);
  });
