import { loadArticleEditor } from "@/presentation/editorialData";
import type { ArticleEditorData } from "@/presentation/editorialView";
import { readFailureState } from "@/presentation/readFailure";
import { ArticleEditor } from "../ArticleEditor";
import { EditorialProblem } from "../EditorialShell";

/** AM-02 (編集), read on the server; `ArticleEditor` owns the changes. */
export async function ArticleEditorContent({
  articleId,
}: {
  articleId: string;
}) {
  let data: ArticleEditorData;
  try {
    data = await loadArticleEditor(articleId);
  } catch (error) {
    return (
      <EditorialProblem
        kind={(await readFailureState(error)).kind}
        heading="読みものを編集"
      />
    );
  }
  return <ArticleEditor key={data.articleId} data={data} />;
}
