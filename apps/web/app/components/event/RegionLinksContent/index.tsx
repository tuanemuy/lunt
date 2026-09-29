import { EventProblem } from "@/components/event/EventShell/EventProblem";
import { classifyError } from "@/presentation/errorState";
import { loadRegionLinks } from "@/presentation/occasionData";
import type { RegionLinksData } from "@/presentation/occasionView";
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
    return <EventProblem kind={classifyError(error).kind} heading="開催地域" />;
  }
  return <RegionLinkBoard key={occasionId} data={data} />;
}
