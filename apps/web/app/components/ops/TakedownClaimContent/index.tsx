import type { TakedownClaimData } from "@/presentation/moderation";
import { loadTakedownClaim } from "@/presentation/moderationData";
import { readFailureState } from "@/presentation/readFailure";
import { TakedownClaimProblem, TakedownClaimView } from "../TakedownClaimView";

/** OM-04's claim, read on the server; `TakedownClaimView` owns the operations. */
export async function TakedownClaimContent({ claimId }: { claimId: string }) {
  let data: TakedownClaimData;
  try {
    data = await loadTakedownClaim(claimId);
  } catch (error) {
    return (
      <TakedownClaimProblem
        missing={(await readFailureState(error)).kind === "notFound"}
      />
    );
  }
  return <TakedownClaimView key={claimId} data={data} />;
}
