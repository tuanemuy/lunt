import { EventProblem } from "@/components/event/EventShell/EventProblem";
import { classifyError } from "@/presentation/errorState";
import { loadParticipantBoard } from "@/presentation/occasionData";
import type { ParticipantBoardData } from "@/presentation/occasionView";
import { ParticipantBoard } from "../ParticipantBoard";

/** EM-01, read on the server; `ParticipantBoard` owns the exclusions. */
export async function ParticipantBoardContent({
  occasionId,
  participant,
}: {
  occasionId: string;
  participant: string | null;
}) {
  let data: ParticipantBoardData;
  try {
    data = await loadParticipantBoard(occasionId, participant);
  } catch (error) {
    return (
      <EventProblem kind={classifyError(error).kind} heading="参加店舗と申請" />
    );
  }
  return <ParticipantBoard key={occasionId} data={data} />;
}
