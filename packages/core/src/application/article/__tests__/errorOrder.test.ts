import type { ArticleId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { type ArticleKit, articleKit, content } from "./kit";

type Attempt = (
  k: ArticleKit,
  who: Person,
  articleId: ArticleId,
) => Promise<unknown>;

/**
 * `spec/domains/index.md` 「エラーの種類」: the operated article's absence is
 * judged before the role, so a user without `edit_articles` learns that an
 * article is missing (CS-17) but is refused one that exists (CS-05).
 */
const usecases: Readonly<Record<string, Attempt>> = {
  reviseArticle: (k, who, articleId) =>
    k.revise(who, { id: articleId, version: Version.initial() }, content()),
  publishArticle: (k, who, articleId) => k.publish(who, articleId),
  unpublishArticle: (k, who, articleId) => k.unpublish(who, articleId),
  getArticleForEditing: (k, who, articleId) => k.get(who, articleId),
  previewArticle: (k, who, articleId) => k.preview(who, articleId),
};

describe("article usecases: not found before the role", () => {
  for (const [name, attempt] of Object.entries(usecases)) {
    it(`${name}: a user without the editor role gets NotFoundError for a missing article`, async () => {
      const k = articleKit();
      const U = await k.person("user");
      await expectCode(
        attempt(k, U, k.absentArticleId()),
        NotFoundError,
        "ARTICLE_NOT_FOUND",
      );
    });

    it(`${name}: a user without the editor role gets ForbiddenError for an existing article`, async () => {
      const k = articleKit();
      const U = await k.person("user");
      const article = await k.article({}, "published");
      await expectCode(attempt(k, U, article.id), ForbiddenError);
    });
  }
});
