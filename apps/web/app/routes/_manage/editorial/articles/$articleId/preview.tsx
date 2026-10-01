import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  EditorialProblem,
  EditorialTitle,
} from "@/components/editorial/EditorialShell";
import { ManagePage } from "@/components/layout/ManageShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { classifyError } from "@/presentation/errorState";
import { renderArticlePreview } from "../../-render";

/** CM-03 公開前の確認 of an article (from AM-02). */
export const Route = createFileRoute(
  "/_manage/editorial/articles/$articleId/preview",
)({
  loader: async ({ params }) => {
    const { Content } = await renderArticlePreview({
      data: { articleId: params.articleId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "公開前プレビュー — Lunt" }] }),
  component: ArticlePreviewPage,
  errorComponent: ArticlePreviewPageError,
});

function ArticlePreviewPage() {
  const { Content } = Route.useLoaderData();
  return (
    <Deferred
      promise={Content}
      fallback={
        <ManagePage title={<EditorialTitle heading="公開前プレビュー" />}>
          <ShopSkeleton variant="preview" label="見え方を読み込んでいます" />
        </ManagePage>
      }
    />
  );
}

/** The article's read failed: CS-17, CS-05 or CS-02, in the editorial frame. */
function ArticlePreviewPageError({ error }: ErrorComponentProps) {
  return (
    <EditorialProblem
      kind={classifyError(error).kind}
      heading="公開前プレビュー"
    />
  );
}
