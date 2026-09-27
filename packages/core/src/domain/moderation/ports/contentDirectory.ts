import type { PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";

export type ContentSummary = Readonly<{
  target: ContentRef;
  /** The name (an article's title); `null` while not entered. */
  name: string | null;
  /** The target's current photos, in the target's order. */
  photoIds: readonly PhotoId[];
}>;

/**
 * Resolves listings, places, regions, occasions and articles to their name
 * and current photos, whether viewers can see them or not
 * (`spec/domains/moderation.md` 「ContentDirectory」). Read-only and outside
 * any unit of work: usecases take it from the container and call it
 * outside `run`.
 *
 * `describe` returns the existing ones among 0–100 `targets`
 * (`COMMON_INVALID_INPUT` above) — deleted and missing ones are left out —
 * ordered listing, place, region, occasion, article, then id. Committed
 * writes show immediately.
 */
export interface ContentDirectory {
  describe(targets: readonly ContentRef[]): Promise<readonly ContentSummary[]>;
}

const KIND_ORDER = [
  "listing",
  "place",
  "region",
  "occasion",
  "article",
] as const satisfies readonly ContentRef["kind"][];

const rank = (kind: ContentRef["kind"]): number => KIND_ORDER.indexOf(kind);

/** `describe`'s order: kind (listing … article), then id in code-point order. */
export const ContentOrder = {
  kinds: KIND_ORDER,
  rank,
  compare: (a: ContentRef, b: ContentRef): number =>
    rank(a.kind) - rank(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
};
