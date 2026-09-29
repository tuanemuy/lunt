import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderAffiliationStatus } from "../-renderRelations";

/**
 * SM-05 所属地域の状況. A service operator standing in for an absent
 * steward does not open SM-05 (「サービス運営者の不在の代行」); they land
 * on SM-02.
 */
export const Route = createFileRoute("/_manage/manage/places/$placeId/regions")(
  {
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
      const { Content } = await renderAffiliationStatus({
        data: { placeId: params.placeId },
      });
      return { Content };
    },
    head: () => ({ meta: [{ title: "所属地域の状況 — Lunt" }] }),
    component: AffiliationStatusPage,
  },
);

function AffiliationStatusPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="所属地域の状況">
            <ShopSkeleton
              variant="list"
              label="所属地域の状況を読み込んでいます"
            />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
