import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { StewardedTargetSummary } from "../stewardedTarget";

/**
 * Whether stewarded targets (places, regions, occasions) exist, and their
 * names (`spec/domains/authority.md` 「StewardedTargetDirectory」).
 * Read-only and outside any unit of work: usecases take it from the
 * container and call it outside `run`.
 *
 * `describe` returns the existing ones among 0–100 `targets`
 * (`COMMON_INVALID_INPUT` above) — drafts, unpublished and suspended ones
 * included, an unnamed draft with `name: null` — ordered place, region,
 * occasion, then target id. Committed writes show immediately.
 */
export interface StewardedTargetDirectory {
  describe(
    targets: readonly StewardedRef[],
  ): Promise<readonly StewardedTargetSummary[]>;
}
