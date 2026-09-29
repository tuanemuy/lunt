import { classifyError } from "@/presentation/errorState";
import { loadRegionLinksFirst } from "@/presentation/regionData";
import type { ListPage, RegionLinkItem } from "@/presentation/regionView";
import { RegionLinkBoard } from "../RegionLinkBoard";
import { RegionProblem } from "../RegionProblem";

/** RM-03, read on the server; `RegionLinkBoard` owns the detaches. */
export async function RegionLinksContent({ regionId }: { regionId: string }) {
  let first: ListPage<RegionLinkItem>;
  try {
    first = await loadRegionLinksFirst(regionId);
  } catch (error) {
    return (
      <RegionProblem
        kind={classifyError(error).kind}
        heading="関連づけられたイベント"
        failedTitle="関連づけられたイベントを読み込めませんでした"
      />
    );
  }
  return <RegionLinkBoard key={regionId} regionId={regionId} first={first} />;
}
