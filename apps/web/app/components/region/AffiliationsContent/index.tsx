import { classifyError } from "@/presentation/errorState";
import { loadAffiliations } from "@/presentation/regionData";
import type { AffiliationsData } from "@/presentation/regionView";
import { AffiliationBoard } from "../AffiliationBoard";
import { RegionProblem } from "../RegionProblem";

/** RM-01, read on the server; `AffiliationBoard` owns the exclusions. */
export async function AffiliationsContent({ regionId }: { regionId: string }) {
  let data: AffiliationsData;
  try {
    data = await loadAffiliations(regionId);
  } catch (error) {
    return (
      <RegionProblem
        kind={classifyError(error).kind}
        heading="所属店舗と申請"
        failedTitle="所属店舗と申請を読み込めませんでした"
      />
    );
  }
  return <AffiliationBoard key={data.regionId} data={data} />;
}
