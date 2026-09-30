import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { ArticleErrorCode } from "./errorCode";

declare const articleTitleBrand: unique symbol;
declare const articleBodyBrand: unique symbol;
declare const showcaseListBrand: unique symbol;

/** An article's title: trimmed, 1–100 characters, one line. */
export type ArticleTitle = string & { readonly [articleTitleBrand]: true };

/** An article's body: trimmed, 1–20,000 characters; may span lines; plain text. */
export type ArticleBody = string & { readonly [articleBodyBrand]: true };

/**
 * The targets an article showcases (紹介先), in the order the article shows
 * them, with no target twice. No upper bound on the count.
 */
export type ShowcaseList = readonly ShowcaseRef[] & {
  readonly [showcaseListBrand]: true;
};

const LINE_BREAK = /[\r\n\u2028\u2029]/u;

const withinLength = (value: string, max: number): boolean => {
  const length = TextNormalization.characterCount(value);
  return length >= 1 && length <= max;
};

export const ArticleTitle = {
  maxLength: 100,
  /** Throws `ARTICLE_INVALID_TITLE` unless 1–100 characters without a line break. */
  create: (input: string): ArticleTitle => {
    const value = input.trim();
    if (
      !withinLength(value, ArticleTitle.maxLength) ||
      LINE_BREAK.test(value)
    ) {
      throw new BusinessRuleError(
        ArticleErrorCode.InvalidTitle,
        "Invalid article title",
      );
    }
    return value as ArticleTitle;
  },
};

export const ArticleBody = {
  maxLength: 20_000,
  /** Throws `ARTICLE_INVALID_BODY` unless 1–20,000 characters. */
  create: (input: string): ArticleBody => {
    const value = input.trim();
    if (!withinLength(value, ArticleBody.maxLength)) {
      throw new BusinessRuleError(
        ArticleErrorCode.InvalidBody,
        "Invalid article body",
      );
    }
    return value as ArticleBody;
  },
};

const sameRef = (a: ShowcaseRef, b: ShowcaseRef | undefined): boolean =>
  b !== undefined && a.kind === b.kind && a.id === b.id;

export const ShowcaseList = {
  /** Throws `ARTICLE_INVALID_SHOWCASE_LIST` when the same target appears twice. */
  create: (refs: readonly ShowcaseRef[]): ShowcaseList => {
    const keys = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
    if (keys.size !== refs.length) {
      throw new BusinessRuleError(
        ArticleErrorCode.InvalidShowcaseList,
        "The same showcase appears more than once",
      );
    }
    return [...refs] as readonly ShowcaseRef[] as ShowcaseList;
  },

  /** The same targets in the same order. */
  equals: (a: readonly ShowcaseRef[], b: readonly ShowcaseRef[]): boolean =>
    a.length === b.length && a.every((ref, i) => sameRef(ref, b[i])),
};
