import { loadArticleScreen } from "@/presentation/readingData";
import { ArticleView } from "../ArticleView";

/** DT-05's body as a server component: the article, or CS-06. */
export async function ArticleContent({ articleId }: { articleId: string }) {
  return <ArticleView screen={await loadArticleScreen(articleId)} />;
}
