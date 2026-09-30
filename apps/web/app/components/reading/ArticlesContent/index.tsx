import { loadArticlesPage } from "@/presentation/readingData";
import { ArticleList } from "../ArticleList";

/** VW-09's body as a server component: the first page, handed to `ArticleList`. */
export async function ArticlesContent() {
  return <ArticleList first={await loadArticlesPage(1)} />;
}
