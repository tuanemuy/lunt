import { createFileRoute } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderListingPreview } from "../../../-render";

/** CM-03 公開前の確認 of a store's listing (from SM-04). */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/listings/$listingId/preview",
)({
  loader: async ({ params }) => {
    const { Content } = await renderListingPreview({
      data: { placeId: params.placeId, listingId: params.listingId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "公開前プレビュー — Lunt" }] }),
  component: ListingPreviewPage,
});

function ListingPreviewPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="公開前プレビュー">
            <ShopSkeleton variant="preview" label="見え方を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
