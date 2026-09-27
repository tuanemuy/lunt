import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import type { StewardedKind } from "@repo/core/domain/common/refs";
import type {
  StewardedTargetRecord,
  TargetRecord,
} from "../protocol/authority";
import type { SqlExec } from "../sql";
import { placeStewardedTargetLookup } from "./place";

/**
 * Reads the existing targets of one kind among `ids` (at most 100, passed
 * as one JSON parameter via `json_each(?)`) with their names — drafts,
 * unpublished and suspended ones included, an unnamed draft as `null`.
 */
export type StewardedTargetLookup = (
  sql: SqlExec,
  ids: readonly string[],
) => readonly Readonly<{ id: string; name: string | null }>[];

export type StewardedTargetLookups = Readonly<
  Partial<Record<StewardedKind, StewardedTargetLookup>>
>;

/**
 * `StewardedTargetDirectory`'s per-kind lookups — the one place a target
 * kind joins the directory. Place (S2A), region and occasion (S3A) each
 * add their entry here when their tables land; a kind without an entry
 * reads as having no targets.
 */
export const STEWARDED_TARGET_LOOKUPS: StewardedTargetLookups = {
  place: placeStewardedTargetLookup,
};

/**
 * The directory's read over any lookup table: groups `targets` by kind,
 * asks each kind's lookup, and returns the existing ones once each, in
 * listing order (place, region, occasion, then id).
 */
export function describeStewardedTargets(
  sql: SqlExec,
  targets: readonly TargetRecord[],
  lookups: StewardedTargetLookups,
): readonly StewardedTargetRecord[] {
  const found: Readonly<{
    target: Readonly<{ kind: StewardedKind; id: string }>;
    name: string | null;
  }>[] = [];
  for (const kind of StewardedTargetOrder.kinds) {
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
      found.push({ target: { kind, id: row.id }, name: row.name });
    }
  }
  return found.sort((a, b) => StewardedTargetOrder.compare(a.target, b.target));
}
