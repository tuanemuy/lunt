import type { ArticleErrorCode } from "@repo/core/domain/article/errorCode";
import { type BusinessErrorPresentation, invalid } from "./presentation";

/** How each Article business error is shown (CS-08 / CS-10). */
export const articleErrorCatalog = {
  ARTICLE_INVALID_TITLE: invalid(
    "タイトルは改行を含めずに100文字以内で入力してください",
  ),
  ARTICLE_INVALID_BODY: invalid("本文は20000文字以内で入力してください"),
  ARTICLE_INVALID_SHOWCASE_LIST: invalid(
    "同じ紹介先を2回以上選ぶことはできません",
  ),
} satisfies Record<ArticleErrorCode, BusinessErrorPresentation>;
