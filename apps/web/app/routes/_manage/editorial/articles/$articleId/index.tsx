import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { z } from "zod";
import {
  EditorialProblem,
  EditorialTitle,
} from "@/components/editorial/EditorialShell";
import { ManagePage } from "@/components/layout/ManageShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { classifyError } from "@/presentation/errorState";
import { renderArticleEditor } from "../../-render";

const searchSchema = z.object({
  /** Arrived from AM-02 新規 after the draft was created (CS-13). */
  created: z.literal(true).optional().catch(undefined),
});

/** AM-02 読みものの編集 (`/editorial/articles/$articleId`). */
export const Route = createFileRoute("/_manage/editorial/articles/$articleId/")(
  {
    validateSearch: searchSchema,
    loader: async ({ params }) => {
      const { Content } = await renderArticleEditor({
        data: { articleId: params.articleId },
      });
      return { Content };
    },
    head: () => ({ meta: [{ title: "読みものの編集 — Lunt" }] }),
    component: ArticleEditorPage,
    errorComponent: ArticleEditorPageError,
  },
);

function ArticleEditorPage() {
  const { Content } = Route.useLoaderData();
  return (
    <Deferred
      promise={Content}
      fallback={
        <ManagePage title={<EditorialTitle heading="読みもの" />}>
          <ShopSkeleton variant="form" label="読みものを読み込んでいます" />
        </ManagePage>
      }
    />
  );
}

/** The article's read failed: CS-17, CS-05 or CS-02, in the editorial frame. */
function ArticleEditorPageError({ error }: ErrorComponentProps) {
  return (
    <EditorialProblem
      kind={classifyError(error).kind}
      heading="読みものを編集"
    />
  );
}
