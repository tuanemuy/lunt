import { createFileRoute } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderPlaceEditor } from "../-render";

/** SM-02 店舗情報 (編集). */
export const Route = createFileRoute("/_manage/manage/places/$placeId/info")({
  loader: async ({ params }) => {
    const { Content } = await renderPlaceEditor({
      data: { placeId: params.placeId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "店舗情報 — Lunt" }] }),
  component: PlaceInfoPage,
});

function PlaceInfoPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="店舗情報を編集">
            <ShopSkeleton variant="form" label="店舗情報を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
