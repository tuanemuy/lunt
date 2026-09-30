import { createFileRoute } from "@tanstack/react-router";
import { NewArticleEditor } from "@/components/editorial/NewArticleEditor";

/**
 * AM-02 新規 (`/editorial/articles/new`): the empty form, interactive from
 * the start; nothing to read.
 */
export const Route = createFileRoute("/_manage/editorial/articles/new")({
  head: () => ({ meta: [{ title: "新しい読みもの — Lunt" }] }),
  component: NewArticleEditor,
});
