import { loadArticleEditor } from "@/presentation/editorialData";
import { ArticleEditor } from "../ArticleEditor";

/**
 * AM-02 (編集), read on the server before its body streams; `ArticleEditor`
 * owns the changes. A missing article (CS-17) or a non-editor (CS-05)
 * throws here, so the route fails and the document answers 404 / 403.
 */
export async function readArticleEditor(articleId: string) {
  const data = await loadArticleEditor(articleId);
  return <ArticleEditor key={data.articleId} data={data} />;
}
