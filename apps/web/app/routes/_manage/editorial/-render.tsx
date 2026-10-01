import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { articleRefSchema } from "@/presentation/editorial";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

// The editorial screens' bodies as RSC payloads, returned unresolved so
// each loader can forward them and the body streams in under its
// skeleton. The usecases behind every body check the editor role
// themselves. AM-01 renders its own CS-05; an article's screens read the
// article before the body streams and throw its CS-17 / CS-05 to the
// route, so the document answers 404 / 403 (`documentStatusOf`).

/** AM-01. */
export const renderArticleList = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ArticleListContent } = await import(
      "@/components/editorial/ArticleListContent"
    );
    return { Content: renderServerComponent(<ArticleListContent />) };
  });

/** AM-02 (編集). */
export const renderArticleEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(articleRefSchema))
  .handler(async ({ data }) => {
    const { readArticleEditor } = await import(
      "@/components/editorial/ArticleEditorContent"
    );
    return {
      Content: renderServerComponent(await readArticleEditor(data.articleId)),
    };
  });

/** CM-03 of an article. */
export const renderArticlePreview = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(articleRefSchema))
  .handler(async ({ data }) => {
    const { readArticlePreview } = await import(
      "@/components/editorial/ArticlePreviewContent"
    );
    return {
      Content: renderServerComponent(await readArticlePreview(data.articleId)),
    };
  });
