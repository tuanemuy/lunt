import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { paginationSchema } from "./pagination";
import type {
  AffiliatedPlaceItem,
  ListPage,
  RegionApplicationItem,
  RegionFrame,
  RegionLinkItem,
} from "./regionView";
import { validateInput } from "./validator";

/*
 * RM-01〜RM-03 and RM-02 新規: the transport schemas and server functions.
 * Server-only reads live in `regionData.ts`.
 */

const idField = z.string().min(1).max(64);

export const regionRefSchema = z.object({ regionId: idField });

/**
 * The RM screens' guard and frame (`beforeLoad` of
 * `/manage/regions/$regionId`): the region and whether the viewer manages
 * it as its steward or as the operator standing in for an absent one.
 * Anyone else gets `ForbiddenError` (CS-05) — an operator while the region
 * has a steward `REGION_PROXY_UNAVAILABLE` (CS-15); an unknown region
 * `NotFoundError` (CS-17).
 */
export const loadRegionFrameFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionRefSchema))
  .handler(async ({ data }): Promise<RegionFrame> => {
    const { loadRegionFrame } = await import("./regionData");
    return loadRegionFrame(data.regionId);
  });

const optionalText = (max: number, message: string) =>
  z.string().max(max, message).nullable();

export const regionContentSchema = z.object({
  name: optionalText(100, "名称は100文字以内で入力してください"),
  tagline: optionalText(60, "キャッチコピーは60文字以内で入力してください"),
  description: optionalText(2000, "紹介は2000文字以内で入力してください"),
  photoIds: z.array(idField).max(20, "写真は20枚までです"),
  address: z
    .object({
      town: z.object({
        areaCode: z.string().max(16),
        municipalityCode: z.string().max(16),
        name: z.string().max(200),
      }),
      rest: z.string().max(200, "町域より後は200文字以内で入力してください"),
    })
    .nullable(),
  location: z
    .object({
      latitude: z
        .number()
        .min(-90, "緯度は-90〜90の数で入力してください")
        .max(90, "緯度は-90〜90の数で入力してください"),
      longitude: z
        .number()
        .min(-180, "経度は-180〜180の数で入力してください")
        .max(180, "経度は-180〜180の数で入力してください"),
    })
    .nullable(),
});

export type RegionContentInput = z.infer<typeof regionContentSchema>;

export const registerRegionSchema = z.object({
  regionId: idField,
  content: regionContentSchema,
});

/** RM-02 新規 (REG-12): an operator registers a region as a draft. */
export const registerRegionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(registerRegionSchema))
  .handler(async ({ data }) => {
    const { registerRegionAsOperator } = await import("./regionData");
    return registerRegionAsOperator(data.regionId, data.content);
  });

export const updateRegionSchema = z.object({
  regionId: idField,
  version: z.number().int().min(0),
  content: regionContentSchema,
});

/** RM-02: saves the region's whole content (REG-06, REG-13, MOD-03). */
export const updateRegionContentFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(updateRegionSchema))
  .handler(async ({ data }) => {
    const { saveRegionContent } = await import("./regionData");
    return saveRegionContent(data.regionId, data.version, data.content);
  });

export const REGION_PUBLICATION_CHANGES = ["publish", "unpublish"] as const;
export type RegionPublicationChange =
  (typeof REGION_PUBLICATION_CHANGES)[number];

/** RM-02 (CF-08): publishes, or unpublishes (公開の取り下げ), the region. */
export const changeRegionPublicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      regionRefSchema.extend({ change: z.enum(REGION_PUBLICATION_CHANGES) }),
    ),
  )
  .handler(async ({ data }) => {
    const { changeRegionPublication } = await import("./regionData");
    return changeRegionPublication(data.regionId, data.change);
  });

const placeInRegion = regionRefSchema.extend({ placeId: idField });

/** RM-01: excludes an affiliated place (REG-10), without a reason. */
export const excludeAffiliatedPlaceFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeInRegion))
  .handler(async ({ data }) => {
    const { excludePlace } = await import("./regionData");
    await excludePlace(data.regionId, data.placeId);
    return null;
  });

/** RM-01: a further page of the affiliated places (CF-05). */
export const listAffiliatedPlacesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(paginationSchema.extend({ regionId: idField })))
  .handler(async ({ data }): Promise<ListPage<AffiliatedPlaceItem>> => {
    const { loadAffiliatedPlaces } = await import("./regionData");
    return loadAffiliatedPlaces(data.regionId, {
      page: data.page,
      limit: data.limit,
    });
  });

/** RM-01: a further page of the affiliation / leave applications (CF-05). */
export const listRegionApplicationsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(paginationSchema.extend({ regionId: idField })))
  .handler(async ({ data }): Promise<ListPage<RegionApplicationItem>> => {
    const { loadRegionApplications } = await import("./regionData");
    return loadRegionApplications(data.regionId, {
      page: data.page,
      limit: data.limit,
    });
  });

const occasionInRegion = regionRefSchema.extend({ occasionId: idField });

export const REGION_LINK_CHANGES = ["detach", "restore"] as const;
export type RegionLinkChange = (typeof REGION_LINK_CHANGES)[number];

/** RM-03: detaches an occasion's link, or revokes the detach (REG-11). */
export const changeRegionLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      occasionInRegion.extend({ change: z.enum(REGION_LINK_CHANGES) }),
    ),
  )
  .handler(async ({ data }) => {
    const { changeRegionLink } = await import("./regionData");
    await changeRegionLink(data.regionId, data.occasionId, data.change);
    return null;
  });

/** RM-03: a further page of the linked occasions (CF-05). */
export const listRegionLinksFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(paginationSchema.extend({ regionId: idField })))
  .handler(async ({ data }): Promise<ListPage<RegionLinkItem>> => {
    const { loadRegionLinks } = await import("./regionData");
    return loadRegionLinks(data.regionId, {
      page: data.page,
      limit: data.limit,
    });
  });
