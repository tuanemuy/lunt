import { classifyError } from "@/presentation/errorState";
import type { AffiliationStatusData } from "@/presentation/shopRelations";
import { loadAffiliationStatus } from "@/presentation/shopRelationsData";
import { AffiliationStatusView } from "../AffiliationStatusView";
import { ShopProblem } from "../ShopProblem";

/** SM-05's body, read on the server; `AffiliationStatusView` draws it. */
export async function AffiliationStatusContent({
  placeId,
}: {
  placeId: string;
}) {
  let data: AffiliationStatusData;
  try {
    data = await loadAffiliationStatus(placeId);
  } catch (error) {
    return (
      <ShopProblem
        kind={classifyError(error).kind}
        heading="所属地域の状況"
        missingTitle="店舗が見つかりません"
        back={{ label: "店舗ホームへ戻る", to: "home" }}
      />
    );
  }
  return <AffiliationStatusView data={data} />;
}
