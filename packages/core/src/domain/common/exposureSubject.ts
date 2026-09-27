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
