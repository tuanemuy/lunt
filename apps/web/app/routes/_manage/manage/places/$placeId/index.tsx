import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderShopHome } from "../-render";

/**
 * SM-01 店舗ホーム. A service operator standing in for an absent steward
 * does not open SM-01 (「サービス運営者の不在の代行」); they land on SM-02.
 */
export const Route = createFileRoute("/_manage/manage/places/$placeId/")({
  beforeLoad: ({ context, params }) => {
    if (context.frame.basis === "proxy") {
      throw redirect({
        to: "/manage/places/$placeId/info",
        params,
        replace: true,
      });
    }
  },
  loader: async ({ params }) => {
    const { Content } = await renderShopHome({
      data: { placeId: params.placeId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "店舗ホーム — Lunt" }] }),
  component: ShopHomePage,
});

function ShopHomePage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame}>
            <ShopSkeleton variant="home" label="店舗の状況を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
