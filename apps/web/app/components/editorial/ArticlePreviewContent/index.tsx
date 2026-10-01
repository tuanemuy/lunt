import { loadArticlePreview } from "@/presentation/editorialData";
import type { ArticlePreviewData } from "@/presentation/editorialView";
import { readFailureState } from "@/presentation/readFailure";
import { ArticlePreview } from "../ArticlePreview";
import { EditorialProblem } from "../EditorialShell";

/** CM-03's preview of an article, read on the server; `ArticlePreview` owns the publish. */
export async function ArticlePreviewContent({
  articleId,
}: {
  articleId: string;
}) {
  let data: ArticlePreviewData;
  try {
    data = await loadArticlePreview(articleId);
  } catch (error) {
    return (
      <EditorialProblem
        kind={(await readFailureState(error)).kind}
        heading="公開前プレビュー"
      />
    );
  }
  return <ArticlePreview key={data.articleId} data={data} />;
}
