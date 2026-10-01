import { ShopProblem } from "@/components/manage/ShopProblem";
import {
  loadCategoryOptions,
  loadListingEditor,
  loadListingName,
  loadNewListing,
} from "@/presentation/listingData";
import { readFailureState } from "@/presentation/readFailure";
import { ListingEditor } from "../ListingEditor";
import { NewListingEditor } from "../NewListingEditor";

/**
 * SM-04 (編集), read on the server before its body streams; `ListingEditor`
 * owns the changes. A missing listing (CS-17) throws here, so the route
 * fails and the document answers 404.
 */
export async function readListingEditor({
  placeId,
  listingId,
  copyFrom,
  created,
}: {
  placeId: string;
  listingId: string;
  copyFrom: string | null;
  created: boolean;
}) {
  const [data, categories, sourceName] = await Promise.all([
    loadListingEditor(placeId, listingId),
    loadCategoryOptions(),
    copyFrom === null ? null : loadListingName(placeId, copyFrom),
  ]);
  return (
    <ListingEditor
      key={data.id}
      data={data}
      categories={categories}
      copiedFrom={copyFrom === null ? null : { name: sourceName }}
      created={created}
    />
  );
}

/** SM-04 (新規): the categories and the store to start from. */
export async function NewListingContent({ placeId }: { placeId: string }) {
  let read: Awaited<ReturnType<typeof loadNewListing>>;
  try {
    read = await loadNewListing(placeId);
  } catch (error) {
    return (
      <ShopProblem
        kind={(await readFailureState(error)).kind}
        heading="掲載を追加"
        missingTitle="店舗が見つかりません"
        back={{ label: "マイページへ戻る", to: "home" }}
      />
    );
  }
  return (
    <NewListingEditor
      key={read.place.id}
      categories={read.categories}
      place={read.place}
    />
  );
}
