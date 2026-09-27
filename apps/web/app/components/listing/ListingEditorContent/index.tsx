import { ShopProblem } from "@/components/manage/ShopProblem";
import { classifyError } from "@/presentation/errorState";
import {
  loadCategoryOptions,
  loadListingEditor,
  loadListingName,
  loadNewListing,
} from "@/presentation/listingData";
import { ListingEditor } from "../ListingEditor";
import { NewListingEditor } from "../NewListingEditor";

const MISSING = {
  missingTitle: "この掲載は削除されています",
  back: { label: "掲載の一覧へ戻る", to: "listings" },
} as const;

const readEditor = (
  placeId: string,
  listingId: string,
  copyFrom: string | null,
) =>
  Promise.all([
    loadListingEditor(placeId, listingId),
    loadCategoryOptions(),
    copyFrom === null ? null : loadListingName(placeId, copyFrom),
  ]);

/** SM-04 (編集), read on the server; `ListingEditor` owns the changes. */
export async function ListingEditorContent({
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
  let read: Awaited<ReturnType<typeof readEditor>>;
  try {
    read = await readEditor(placeId, listingId, copyFrom);
  } catch (error) {
    return (
      <ShopProblem
        kind={classifyError(error).kind}
        heading="掲載を編集"
        {...MISSING}
      />
    );
  }
  const [data, categories, sourceName] = read;
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
        kind={classifyError(error).kind}
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
