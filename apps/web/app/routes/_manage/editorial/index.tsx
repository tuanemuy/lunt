import { createFileRoute } from "@tanstack/react-router";
import { ArticleListFrame } from "@/components/editorial/ArticleList/frame";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { editorialSearchSchema } from "@/presentation/editorial";
import { renderArticleList } from "./-render";

/** AM-01 読みものの一覧 (`?status=` opens at that state's section). */
export const Route = createFileRoute("/_manage/editorial/")({
  validateSearch: editorialSearchSchema,
  loader: async () => {
    const { Content } = await renderArticleList();
    return { Content };
  },
  head: () => ({ meta: [{ title: "読みものの一覧 — Lunt" }] }),
  component: ArticleListPage,
});

function ArticleListPage() {
  const { Content } = Route.useLoaderData();
  return (
    <Deferred
      promise={Content}
      fallback={
        <ArticleListFrame>
          <ShopSkeleton variant="list" label="読みものを読み込んでいます" />
        </ArticleListFrame>
      }
    />
  );
}
