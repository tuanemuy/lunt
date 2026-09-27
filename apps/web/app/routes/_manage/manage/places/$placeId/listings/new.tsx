import { createFileRoute } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderNewListing } from "../../-render";

/** SM-04 掲載の編集 (新規). */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/listings/new",
)({
  loader: async ({ params }) => {
    const { Content } = await renderNewListing({
      data: { placeId: params.placeId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "掲載を追加 — Lunt" }] }),
  component: NewListingPage,
});

function NewListingPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="掲載を追加">
            <ShopSkeleton variant="form" label="掲載の追加を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
