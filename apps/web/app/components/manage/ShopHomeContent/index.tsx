import { classifyError } from "@/presentation/errorState";
import type { ShopHomeData } from "@/presentation/placeView";
import { loadShopHome } from "@/presentation/shopData";
import { ShopHomeView } from "../ShopHomeView";
import { ShopProblem } from "../ShopProblem";

/** SM-01's body, read on the server; `ShopHomeView` draws it. */
export async function ShopHomeContent({ placeId }: { placeId: string }) {
  let data: ShopHomeData;
  try {
    data = await loadShopHome(placeId);
  } catch (error) {
    return (
      <ShopProblem
        kind={classifyError(error).kind}
        missingTitle="店舗が見つかりません"
        back={{ label: "マイページへ戻る", to: "home" }}
      />
    );
  }
  return <ShopHomeView data={data} />;
}
