import { loadArticlePreview } from "@/presentation/editorialData";
import { ArticlePreview } from "../ArticlePreview";

/**
 * CM-03's preview of an article, read on the server before its body
 * streams; `ArticlePreview` owns the publish. A missing article (CS-17) or
 * a non-editor (CS-05) throws here, so the route fails and the document
 * answers 404 / 403.
 */
export async function readArticlePreview(articleId: string) {
  const data = await loadArticlePreview(articleId);
  return <ArticlePreview key={data.articleId} data={data} />;
}
