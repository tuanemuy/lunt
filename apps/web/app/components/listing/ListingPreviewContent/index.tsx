import { ShopProblem } from "@/components/manage/ShopProblem";
import { loadListingPreview } from "@/presentation/listingData";
import type { ListingPreviewData } from "@/presentation/listingView";
import { readFailureState } from "@/presentation/readFailure";
import { ListingPreview } from "../ListingPreview";

/** CM-03's preview, read on the server; `ListingPreview` owns the publish. */
export async function ListingPreviewContent({
  placeId,
  listingId,
}: {
  placeId: string;
  listingId: string;
}) {
  let data: ListingPreviewData;
  try {
    data = await loadListingPreview(placeId, listingId);
  } catch (error) {
    return (
      <ShopProblem
        kind={(await readFailureState(error)).kind}
        heading="公開前プレビュー"
        missingTitle="この掲載は削除されています"
        back={{ label: "掲載の一覧へ戻る", to: "listings" }}
      />
    );
  }
  return <ListingPreview key={data.id} data={data} />;
}
