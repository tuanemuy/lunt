import { StewardedRef } from "@repo/core/domain/common/refs";

/** A stewarded target that exists, with its name (`null` for an unnamed draft). */
export type StewardedTargetSummary = Readonly<{
  target: StewardedRef;
  name: string | null;
}>;

const KIND_RANK: Readonly<Record<StewardedRef["kind"], number>> = {
  place: 0,
  region: 1,
  occasion: 2,
};

type KindAndId = Readonly<{ kind: StewardedRef["kind"]; id: string }>;

/** Unicode code point order, independent of locale and collation. */
function compareCodePoints(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff =
      (left[i]?.codePointAt(0) ?? 0) - (right[i]?.codePointAt(0) ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

/**
 * The order stewarded targets are listed in: place, region, occasion,
 * then id ascending by code point.
 */
export const StewardedTargetOrder = {
  kinds: StewardedRef.kinds,
  rank: (kind: StewardedRef["kind"]): number => KIND_RANK[kind],
  compare: (a: KindAndId, b: KindAndId): number =>
    KIND_RANK[a.kind] - KIND_RANK[b.kind] || compareCodePoints(a.id, b.id),
};
