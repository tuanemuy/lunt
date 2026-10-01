import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { ShopProblem } from "@/components/manage/ShopProblem";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { classifyError } from "@/presentation/errorState";
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
  errorComponent: ListingPreviewError,
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

/** The listing's read failed: CS-17 (back to SM-03), CS-05 or CS-02, in the store's frame. */
function ListingPreviewError({ error }: ErrorComponentProps) {
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <ShopProblem
        kind={classifyError(error).kind}
        heading="公開前プレビュー"
        missingTitle="この掲載は削除されています"
        back={{ label: "掲載の一覧へ戻る", to: "listings" }}
      />
    </ShopShell>
  );
}
