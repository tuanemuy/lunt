import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { LISTING_SHELVES, type ListingRowsPage } from "./listingView";
import { paginationSchema } from "./pagination";
import { validateInput } from "./validator";

const idField = z.string().min(1).max(64);
const dateField = z.string().max(10);

const framingSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .nullable();

const offeringSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("period"),
    start: dateField.nullable(),
    end: dateField.nullable(),
  }),
  z.object({
    kind: z.literal("dates"),
    dates: z.array(dateField).max(366, "開催日は366日までです"),
  }),
]);

/** A listing's content as SM-04 sends it (`ListingContentInput`). */
export const listingContentSchema = z.object({
  name: z.string().max(200, "名称は200文字以内で入力してください").nullable(),
  description: z
    .string()
    .max(4000, "紹介文は4000文字以内で入力してください")
    .nullable(),
  categoryId: idField.nullable(),
  photos: z
    .array(z.object({ photoId: idField, framing: framingSchema }))
    .max(20, "写真は20枚までです"),
  offering: offeringSchema,
});

export type ListingContentValues = z.infer<typeof listingContentSchema>;

export const listingRefSchema = z.object({ listingId: idField });

export const createListingSchema = z.object({
  listingId: idField,
  placeId: idField,
  content: listingContentSchema,
});

/** SM-04 新規: saves a new draft (LST-01, LST-15). Idempotent on the caller-minted id. */
export const createListingDraftFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(createListingSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { createListingDraft },
      { parseGeneratedId },
      { placeIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/createListingDraft"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const listing = await createListingDraft({
      container,
      actor,
      input: {
        listingId: parseGeneratedId(
          container.idGenerator,
          "listingId",
          data.listingId,
        ),
        placeId: placeIdOf(data.placeId),
        content: data.content,
      },
    });
    return { listingId: listing.id };
  });

export const updateListingSchema = z.object({
  listingId: idField,
  version: z.number().int().min(0),
  content: listingContentSchema,
});

/** SM-04: saves the content in any state (LST-06). */
export const updateListingFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(updateListingSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { updateListing },
      { listingIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/updateListing"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const listing = await updateListing({
      container,
      actor,
      input: {
        listingId: listingIdOf(data.listingId),
        version: data.version,
        content: data.content,
      },
    });
    return { version: listing.version };
  });

/**
 * The state changes SM-04, CM-03 and OM-03 run on one listing, without a
 * version (the optimistic lock guards concurrent writes).
 */
const LISTING_TRANSITIONS = [
  "publish",
  "unpublish",
  "endOffering",
  "resumeOffering",
  "suspend",
  "unsuspend",
  "delete",
] as const;
export type ListingTransition = (typeof LISTING_TRANSITIONS)[number];

export const transitionListingSchema = z.object({
  listingId: idField,
  transition: z.enum(LISTING_TRANSITIONS),
});

/** Runs one `ListingTransition` (its usecase decides who may). */
export const transitionListingFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(transitionListingSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { requireActor }, { listingIdOf }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("./targetIds"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const args = {
      container,
      actor,
      input: { listingId: listingIdOf(data.listingId) },
    };
    switch (data.transition) {
      case "publish": {
        const { publishListing } = await import(
          "@repo/core/application/listing/publishListing"
        );
        await publishListing(args);
        return null;
      }
      case "unpublish": {
        const { unpublishListing } = await import(
          "@repo/core/application/listing/unpublishListing"
        );
        await unpublishListing(args);
        return null;
      }
      case "endOffering": {
        const { endListingOffering } = await import(
          "@repo/core/application/listing/endListingOffering"
        );
        await endListingOffering(args);
        return null;
      }
      case "resumeOffering": {
        const { resumeListingOffering } = await import(
          "@repo/core/application/listing/resumeListingOffering"
        );
        await resumeListingOffering(args);
        return null;
      }
      case "suspend": {
        const { suspendListing } = await import(
          "@repo/core/application/listing/suspendListing"
        );
        await suspendListing(args);
        return null;
      }
      case "unsuspend": {
        const { unsuspendListing } = await import(
          "@repo/core/application/listing/unsuspendListing"
        );
        await unsuspendListing(args);
        return null;
      }
      case "delete": {
        const { deleteListing } = await import(
          "@repo/core/application/listing/deleteListing"
        );
        await deleteListing(args);
        return null;
      }
    }
  });

export const duplicateListingSchema = z.object({
  sourceId: idField,
  listingId: idField,
});

/** SM-04: copies a listing into a new draft (LST-09). Idempotent on the caller-minted id. */
export const duplicateListingFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(duplicateListingSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { duplicateListing },
      { parseGeneratedId },
      { listingIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/duplicateListing"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const listing = await duplicateListing({
      container,
      actor,
      input: {
        sourceId: listingIdOf(data.sourceId),
        listingId: parseGeneratedId(
          container.idGenerator,
          "listingId",
          data.listingId,
        ),
      },
    });
    return { listingId: listing.id };
  });

/** Listings per SM-03 page (CF-05 loads the next as the list is read). */
export const LISTING_PAGE_SIZE = 20;

export const listingShelfField = z.enum(LISTING_SHELVES).optional();

export const listPlaceListingsSchema = paginationSchema.extend({
  placeId: idField,
  status: listingShelfField,
});

/** SM-03: a further page of a store's listings in one 区分. */
export const listPlaceListingsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(listPlaceListingsSchema))
  .handler(async ({ data }): Promise<ListingRowsPage> => {
    const { loadListingRows } = await import("./listingData");
    const { rows } = await loadListingRows(data.placeId, data.status ?? null, {
      page: data.page,
      limit: data.limit,
    });
    return rows;
  });
