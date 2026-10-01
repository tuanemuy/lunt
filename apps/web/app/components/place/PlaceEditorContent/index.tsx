import { ShopProblem } from "@/components/manage/ShopProblem";
import type { PlaceEditorData } from "@/presentation/placeView";
import { readFailureState } from "@/presentation/readFailure";
import { loadNewPlaceLists, loadPlaceEditor } from "@/presentation/shopData";
import { NewPlaceEditor } from "../NewPlaceEditor";
import { PlaceEditor } from "../PlaceEditor";

/** SM-02 (編集), read on the server; `PlaceEditor` owns the changes. */
export async function PlaceEditorContent({ placeId }: { placeId: string }) {
  let data: PlaceEditorData;
  try {
    data = await loadPlaceEditor(placeId);
  } catch (error) {
    return (
      <ShopProblem
        kind={(await readFailureState(error)).kind}
        heading="店舗情報"
        missingTitle="店舗が見つかりません"
        back={{ label: "マイページへ戻る", to: "home" }}
      />
    );
  }
  return <PlaceEditor key={data.placeId} data={data} />;
}

/** SM-02 (新規・代理登録): the empty form with the prefectures to start from. */
export async function NewPlaceContent() {
  return <NewPlaceEditor lists={await loadNewPlaceLists()} />;
}
