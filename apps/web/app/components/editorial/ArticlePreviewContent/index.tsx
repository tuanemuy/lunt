import { loadArticlePreview } from "@/presentation/editorialData";
import type { ArticlePreviewData } from "@/presentation/editorialView";
import { classifyError } from "@/presentation/errorState";
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
        kind={classifyError(error).kind}
        heading="公開前プレビュー"
      />
    );
  }
  return <ArticlePreview key={data.articleId} data={data} />;
}
