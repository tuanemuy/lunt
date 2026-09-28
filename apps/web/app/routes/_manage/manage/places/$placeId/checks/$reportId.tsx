import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderConfirmationRequest } from "../../-render";

/**
 * SM-07 確認の依頼 (`/manage/places/$placeId/checks/$reportId`), opened
 * from SM-01 and the stewards' confirmation-request notification. A
 * service operator standing in for an absent steward does not open SM-07
 * (「サービス運営者の不在の代行」); they land on SM-02.
 */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/checks/$reportId",
)({
  beforeLoad: ({ context, params }) => {
    if (context.frame.basis === "proxy") {
      throw redirect({
        to: "/manage/places/$placeId/info",
        params: { placeId: params.placeId },
        replace: true,
      });
    }
  },
  loader: async ({ params }) => {
    const { Content } = await renderConfirmationRequest({
      data: { placeId: params.placeId, reportId: params.reportId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "確認の依頼 — Lunt" }] }),
  component: ConfirmationRequestPage,
});

function ConfirmationRequestPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="確認の依頼">
            <ShopSkeleton variant="home" label="確認の依頼を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
