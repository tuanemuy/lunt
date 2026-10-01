import { ShopProblem } from "@/components/manage/ShopProblem";
import { LISTING_PAGE_SIZE } from "@/presentation/listing";
import { loadListingRows } from "@/presentation/listingData";
import type {
  ListingRowsPage,
  ListingShelfCountsView,
  ListingShelfKey,
} from "@/presentation/listingView";
import { readFailureState } from "@/presentation/readFailure";
import { ListingRows } from "../ListingRows";

/** SM-03's first page, read on the server; `ListingRows` loads the rest. */
export async function ListingRowsContent({
  placeId,
  status,
  deleted,
}: {
  placeId: string;
  status: ListingShelfKey | null;
  deleted: boolean;
}) {
  let read: Readonly<{ rows: ListingRowsPage; counts: ListingShelfCountsView }>;
  try {
    read = await loadListingRows(placeId, status, {
      page: 1,
      limit: LISTING_PAGE_SIZE,
    });
  } catch (error) {
    return (
      <ShopProblem
        kind={(await readFailureState(error)).kind}
        heading="掲載"
        missingTitle="店舗が見つかりません"
        back={{ label: "マイページへ戻る", to: "home" }}
      />
    );
  }
  return (
    <ListingRows
      key={status ?? "all"}
      first={read.rows}
      counts={read.counts}
      status={status}
      deleted={deleted}
    />
  );
}
