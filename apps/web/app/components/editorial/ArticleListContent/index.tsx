import { loadEditorialList } from "@/presentation/editorialData";
import type { EditorialListData } from "@/presentation/editorialView";
import { readFailureState } from "@/presentation/readFailure";
import { ArticleList } from "../ArticleList";
import { EditorialProblem } from "../EditorialShell";

/** AM-01's first pages, read on the server; `ArticleList` pages further (CF-05). */
export async function ArticleListContent() {
  let data: EditorialListData;
  try {
    data = await loadEditorialList();
  } catch (error) {
    return (
      <EditorialProblem
        kind={(await readFailureState(error)).kind}
        heading="読みものの一覧"
      />
    );
  }
  return <ArticleList data={data} />;
}
