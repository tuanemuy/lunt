import { EventProblem } from "@/components/event/EventShell/EventProblem";
import { ShopProblem } from "@/components/manage/ShopProblem";
import { loadParticipationEditor } from "@/presentation/occasionData";
import type {
  ParticipationEditorData,
  ParticipationSide,
} from "@/presentation/occasionView";
import { readFailureState } from "@/presentation/readFailure";
import {
  OccasionParticipationEditor,
  PlaceParticipationEditor,
  PlacePicker,
} from "../ParticipationEditor";

/**
 * CM-04, read on the server: the place's steward's participation, the
 * event operator's change of a participant without a steward, or the
 * event operator's add (CF-02 first, then the listings and dates).
 */
export async function ParticipationEditorContent({
  side,
  mode,
  occasionId,
  placeId,
}: {
  side: ParticipationSide;
  mode: "edit" | "add";
  occasionId: string;
  placeId: string | null;
}) {
  if (placeId === null) return <PlacePicker />;
  let data: ParticipationEditorData;
  try {
    data = await loadParticipationEditor({ side, occasionId, placeId });
  } catch (error) {
    const kind = (await readFailureState(error)).kind;
    return side === "place" ? (
      <ShopProblem
        kind={kind}
        heading="参加内容を編集"
        missingTitle="イベントが見つかりません"
        back={{ label: "店舗ホームに戻る", to: "home" }}
      />
    ) : (
      <EventProblem
        kind={kind}
        heading={mode === "add" ? "参加店舗を追加" : "参加内容を編集"}
        missingTitle="店舗が見つかりません"
      />
    );
  }
  return side === "place" ? (
    <PlaceParticipationEditor key={`${occasionId}:${placeId}`} data={data} />
  ) : (
    <OccasionParticipationEditor
      key={`${occasionId}:${placeId}:${mode}`}
      data={data}
      mode={mode}
    />
  );
}
