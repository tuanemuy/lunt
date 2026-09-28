import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { listingShelfField } from "@/presentation/listing";
import { validateInput } from "@/presentation/validator";

// The SM screens' bodies and CM-03 as RSC payloads, returned unresolved so
// each loader can forward them and the body streams in under its skeleton.
// These endpoints can be called without the area's guard, so every body's
// loader repeats its check (`requireManagement`, or a `manage_target`
// usecase); the bodies render their own CS-17 / CS-05 / CS-15.

const idField = z.string().min(1).max(64);
const placeRef = z.object({ placeId: idField });
const listingRef = placeRef.extend({ listingId: idField });

/** SM-01. */
export const renderShopHome = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRef))
  .handler(async ({ data }) => {
    const { ShopHomeContent } = await import(
      "@/components/manage/ShopHomeContent"
    );
    return {
      Content: renderServerComponent(
        <ShopHomeContent placeId={data.placeId} />,
      ),
    };
  });

/** SM-02 (編集). */
export const renderPlaceEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRef))
  .handler(async ({ data }) => {
    const { PlaceEditorContent } = await import(
      "@/components/place/PlaceEditorContent"
    );
    return {
      Content: renderServerComponent(
        <PlaceEditorContent placeId={data.placeId} />,
      ),
    };
  });

/** SM-02 (新規・代理登録). */
export const renderNewPlace = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { NewPlaceContent } = await import(
      "@/components/place/PlaceEditorContent"
    );
    return { Content: renderServerComponent(<NewPlaceContent />) };
  });

/** SM-03. */
export const renderListingRows = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      placeRef.extend({ status: listingShelfField, deleted: z.boolean() }),
    ),
  )
  .handler(async ({ data }) => {
    const { ListingRowsContent } = await import(
      "@/components/listing/ListingRowsContent"
    );
    return {
      Content: renderServerComponent(
        <ListingRowsContent
          placeId={data.placeId}
          status={data.status ?? null}
          deleted={data.deleted}
        />,
      ),
    };
  });

/** SM-04 (新規). */
export const renderNewListing = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRef))
  .handler(async ({ data }) => {
    const { NewListingContent } = await import(
      "@/components/listing/ListingEditorContent"
    );
    return {
      Content: renderServerComponent(
        <NewListingContent placeId={data.placeId} />,
      ),
    };
  });

/** SM-04 (編集), with the source after a duplication and the outcome that led here. */
export const renderListingEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      listingRef.extend({
        copyFrom: idField.optional(),
        created: z.boolean(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { ListingEditorContent } = await import(
      "@/components/listing/ListingEditorContent"
    );
    return {
      Content: renderServerComponent(
        <ListingEditorContent
          placeId={data.placeId}
          listingId={data.listingId}
          copyFrom={data.copyFrom ?? null}
          created={data.created}
        />,
      ),
    };
  });

/** CM-03. */
export const renderListingPreview = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(listingRef))
  .handler(async ({ data }) => {
    const { ListingPreviewContent } = await import(
      "@/components/listing/ListingPreviewContent"
    );
    return {
      Content: renderServerComponent(
        <ListingPreviewContent
          placeId={data.placeId}
          listingId={data.listingId}
        />,
      ),
    };
  });
