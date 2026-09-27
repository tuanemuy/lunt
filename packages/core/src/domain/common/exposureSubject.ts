/**
 * The domains whose aggregates carry a publication state and/or an
 * operator suspension, spelled as their SNAKE_CASE error-code prefix.
 * Shared-kernel functions receive it so the errors they raise carry the
 * caller's prefix (e.g. `LISTING_SUSPENDED`).
 */
export type ExposureSubject =
  | "LISTING"
  | "PLACE"
  | "REGION"
  | "OCCASION"
  | "ARTICLE";

export const ExposureSubject = {
  all: ["LISTING", "PLACE", "REGION", "OCCASION", "ARTICLE"] as const,
} satisfies { all: readonly ExposureSubject[] };

/**
 * Subjects that have a `Publication`. A place (店舗) has only a
 * `Suspension` — a registered place is published — so it can neither be
 * published nor lack a publish condition (`spec/domains/index.md`
 * 「公開状態」「運営による非公開」).
 */
export type PublishableSubject = Exclude<ExposureSubject, "PLACE">;

export const PublishableSubject = {
  all: ["LISTING", "REGION", "OCCASION", "ARTICLE"] as const,
} satisfies { all: readonly PublishableSubject[] };
