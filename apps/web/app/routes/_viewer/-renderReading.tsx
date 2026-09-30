import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

/**
 * VW-09's body as an RSC payload, returned unresolved so the loader can
 * forward it and the list streams in under the skeleton.
 */
export const renderArticles = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ArticlesContent } = await import(
      "@/components/reading/ArticlesContent"
    );
    return { Articles: renderServerComponent(<ArticlesContent />) };
  });

/** DT-05's body for one article (see `renderArticles`); CS-06 streams in too. */
export const renderArticle = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(z.object({ articleId: z.string().trim().min(1).max(128) })),
  )
  .handler(async ({ data }) => {
    const { ArticleContent } = await import(
      "@/components/reading/ArticleContent"
    );
    return {
      Article: renderServerComponent(
        <ArticleContent articleId={data.articleId} />,
      ),
    };
  });
