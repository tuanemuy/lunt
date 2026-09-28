import { classifyError } from "@/presentation/errorState";
import type { ConfirmationRequestData } from "@/presentation/moderation";
import { loadConfirmationRequest } from "@/presentation/moderationData";
import { ConfirmationRequestView } from "../ConfirmationRequestView";
import { ShopProblem } from "../ShopProblem";

/**
 * SM-07's request, read on the server. A request of another store reads
 * as missing (CS-17), like one that does not exist.
 */
export async function ConfirmationRequestContent({
  placeId,
  reportId,
}: {
  placeId: string;
  reportId: string;
}) {
  let data: ConfirmationRequestData;
  try {
    data = await loadConfirmationRequest(reportId);
  } catch (error) {
    return (
      <ShopProblem
        kind={classifyError(error).kind}
        heading="確認の依頼"
        missingTitle="確認の依頼が見つかりません"
        back={{ label: "店舗ホームへ戻る", to: "home" }}
      />
    );
  }
  if (data.target.placeId !== placeId) {
    return (
      <ShopProblem
        kind="notFound"
        heading="確認の依頼"
        missingTitle="確認の依頼が見つかりません"
        back={{ label: "店舗ホームへ戻る", to: "home" }}
      />
    );
  }
  return <ConfirmationRequestView data={data} />;
}
