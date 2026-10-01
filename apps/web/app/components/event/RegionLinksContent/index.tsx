import { EventProblem } from "@/components/event/EventShell/EventProblem";
import { loadRegionLinks } from "@/presentation/occasionData";
import type { RegionLinksData } from "@/presentation/occasionView";
import { readFailureState } from "@/presentation/readFailure";
import { RegionLinkBoard } from "../RegionLinkBoard";

/** EM-03, read on the server; `RegionLinkBoard` owns the links. */
export async function RegionLinksContent({
  occasionId,
}: {
  occasionId: string;
}) {
  let data: RegionLinksData;
  try {
    data = await loadRegionLinks(occasionId);
  } catch (error) {
    return (
      <EventProblem
        kind={(await readFailureState(error)).kind}
        heading="開催地域"
      />
    );
  }
  return <RegionLinkBoard key={occasionId} data={data} />;
}
