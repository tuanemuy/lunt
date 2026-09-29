import { classifyError } from "@/presentation/errorState";
import {
  loadNewRegionLists,
  loadRegionEditor,
} from "@/presentation/regionData";
import type { RegionEditorData } from "@/presentation/regionView";
import { NewRegionEditor } from "../NewRegionEditor";
import { RegionEditor } from "../RegionEditor";
import { RegionProblem } from "../RegionProblem";

/** RM-02 (編集), read on the server; `RegionEditor` owns the changes. */
export async function RegionEditorContent({ regionId }: { regionId: string }) {
  let data: RegionEditorData;
  try {
    data = await loadRegionEditor(regionId);
  } catch (error) {
    return (
      <RegionProblem
        kind={classifyError(error).kind}
        heading="地域情報を編集"
        failedTitle="地域情報を読み込めませんでした"
      />
    );
  }
  return <RegionEditor key={data.regionId} data={data} />;
}

/** RM-02 (新規): the empty form with the prefectures to start from. */
export async function NewRegionContent() {
  return <NewRegionEditor lists={await loadNewRegionLists()} />;
}
