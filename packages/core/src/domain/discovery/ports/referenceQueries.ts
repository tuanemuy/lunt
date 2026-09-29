import type { ContentRef, ShowcaseRef } from "@repo/core/domain/common/refs";
import type { ReferenceResolution } from "../entry";

/**
 * Reference resolution and single-target viewability
 * (`spec/domains/discovery.md` 「ReferenceQueries」). Read-only; never
 * joins a unit of work and reflects every committed write at once.
 *
 * - `resolve`: 0–100 refs (`BookmarkRef` is a `ShowcaseRef`); more throws
 *   `BusinessRuleError` (`COMMON_INVALID_INPUT`) — callers split. Returns
 *   one resolution per distinct ref, in first-seen order: the target when
 *   viewable, `viewable: false` when it is not viewable or does not exist.
 *   No ref is dropped. Reference scene: upcoming / ended listings,
 *   temporarily or permanently closed places, and ended or cancelled
 *   occasions resolve with their target.
 * - `isViewable`: whether the one target is viewable; `false` when it does
 *   not exist. A listing is judged with its place's suspension. Independent
 *   of the date and the scene; the kind and the id decide together.
 *
 * Articles are judged with stage 5; until then no article exists, so an
 * article ref reads as not viewable.
 */
export interface ReferenceQueries {
  resolve(
    refs: readonly ShowcaseRef[],
  ): Promise<readonly ReferenceResolution[]>;
  isViewable(ref: ContentRef): Promise<boolean>;
}
