import { classifyError } from "@/presentation/errorState";
import type { ShopEventsData } from "@/presentation/shopRelations";
import { loadShopEvents } from "@/presentation/shopRelationsData";
import { ShopEventsView } from "../ShopEventsView";
import { ShopProblem } from "../ShopProblem";

/** SM-06's body, read on the server; `ShopEventsView` draws it. */
export async function ShopEventsContent({ placeId }: { placeId: string }) {
  let data: ShopEventsData;
  try {
    data = await loadShopEvents(placeId);
  } catch (error) {
    return (
      <ShopProblem
        kind={classifyError(error).kind}
        heading="イベントの状況"
        missingTitle="店舗が見つかりません"
        back={{ label: "店舗ホームへ戻る", to: "home" }}
      />
    );
  }
  return <ShopEventsView data={data} />;
}
