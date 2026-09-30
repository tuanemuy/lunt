import type { ContentKind } from "@repo/core/domain/common/refs";
import { ContentOrder } from "@repo/core/domain/moderation/ports/contentDirectory";
import type {
  ContentRefRecord,
  ContentSummaryRecord,
} from "../protocol/moderation";
import type { SqlExec } from "../sql";
import { articleContentLookup } from "./article";
import { listingContentLookup } from "./listing";
import { occasionContentLookup } from "./occasion";
import { placeContentLookup } from "./place";
import { regionContentLookup } from "./region";

/**
 * Reads the existing targets of one kind among `ids` (at most 100, passed
 * as one JSON parameter via `json_each(?)`) with their names and current
 * photos in the target's order — unpublished, suspended and drafts included,
 * an unnamed one as `null`.
 */
export type ContentLookup = (
  sql: SqlExec,
  ids: readonly string[],
) => readonly Readonly<{
  id: string;
  name: string | null;
  photoIds: readonly string[];
}>[];

export type ContentLookups = Readonly<
  Partial<Record<ContentKind, ContentLookup>>
>;

/**
 * `ContentDirectory`'s per-kind lookups — the one place a content kind joins
 * the directory. Listing, place (S2A), region, occasion (S3) and article
 * (S4) each add their entry when their tables land; a kind without an entry
 * reads as having no targets, so every name resolves to `null` until then.
 */
export const CONTENT_LOOKUPS: ContentLookups = {
  listing: listingContentLookup,
  place: placeContentLookup,
  region: regionContentLookup,
  occasion: occasionContentLookup,
  article: articleContentLookup,
};

/**
 * The directory's read over any lookup table: groups `targets` by kind,
 * asks each kind's lookup, and returns the existing ones once each in
 * `ContentOrder` (listing, place, region, occasion, article, then id).
 */
export function describeContent(
  sql: SqlExec,
  targets: readonly ContentRefRecord[],
  lookups: ContentLookups,
): readonly ContentSummaryRecord[] {
  const found: {
    target: Readonly<{ kind: ContentKind; id: string }>;
    name: string | null;
    photoIds: readonly string[];
  }[] = [];
  for (const kind of ContentOrder.kinds) {
    const lookup = lookups[kind];
    if (lookup === undefined) continue;
    const ids = [
      ...new Set(
        targets
          .filter((target) => target.kind === kind)
          .map((target) => target.id),
      ),
    ];
    if (ids.length === 0) continue;
    for (const row of lookup(sql, ids)) {
      found.push({
        target: { kind, id: row.id },
        name: row.name,
        photoIds: row.photoIds,
      });
    }
  }
  return found.sort(
    (a, b) =>
      ContentOrder.rank(a.target.kind) - ContentOrder.rank(b.target.kind) ||
      (a.target.id < b.target.id ? -1 : a.target.id > b.target.id ? 1 : 0),
  );
}
