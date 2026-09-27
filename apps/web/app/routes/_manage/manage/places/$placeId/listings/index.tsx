import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { LISTING_SHELVES } from "@/presentation/listingView";
import { renderListingRows } from "../../-render";

const searchSchema = z.object({
  /** The 区分; none = すべて. */
  status: z.enum(LISTING_SHELVES).optional().catch(undefined),
  /** Arrived from SM-04 after deleting a listing (CS-13). */
  deleted: z.literal(true).optional().catch(undefined),
});

/** SM-03 掲載の一覧. */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/listings/",
)({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    status: search.status,
    deleted: search.deleted === true,
  }),
  loader: async ({ params, deps }) => {
    const { Content } = await renderListingRows({
      data: {
        placeId: params.placeId,
        ...(deps.status === undefined ? {} : { status: deps.status }),
        deleted: deps.deleted,
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "掲載 — Lunt" }] }),
  component: ListingsPage,
});

function ListingsPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="掲載">
            <ShopSkeleton variant="list" label="掲載の一覧を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
