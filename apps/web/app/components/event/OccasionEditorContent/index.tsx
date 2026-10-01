import { EventProblem } from "@/components/event/EventShell/EventProblem";
import {
  loadNewOccasionLists,
  loadOccasionEditor,
} from "@/presentation/occasionData";
import type { OccasionEditorData } from "@/presentation/occasionView";
import { readFailureState } from "@/presentation/readFailure";
import { NewOccasionEditor } from "../NewOccasionEditor";
import { OccasionEditor } from "../OccasionEditor";

/** EM-02 (編集), read on the server; `OccasionEditor` owns the changes. */
export async function OccasionEditorContent({
  occasionId,
  created,
}: {
  occasionId: string;
  created: boolean;
}) {
  let data: OccasionEditorData;
  try {
    data = await loadOccasionEditor(occasionId);
  } catch (error) {
    return (
      <EventProblem
        kind={(await readFailureState(error)).kind}
        heading="イベント情報を編集"
      />
    );
  }
  return <OccasionEditor key={data.occasionId} data={data} created={created} />;
}

/** EM-02 (新規): the empty form with the prefectures to start from. */
export async function NewOccasionContent() {
  return <NewOccasionEditor lists={await loadNewOccasionLists()} />;
}
