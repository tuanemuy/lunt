import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type PublishOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * The occasion's operator publishes a draft or re-publishes an unpublished
 * occasion (`spec/usecases/occasion.md` 「publishOccasion」; EVT-06, EVT-12,
 * EVT-13, MOD-03), whatever its holding status. No domain event.
 *
 * - `ForbiddenError` (`manage_target`); `NotFoundError`.
 * - `BusinessRuleError`, in this order: `OCCASION_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION` (already published),
 *   `OCCASION_PUBLISH_CONDITION_UNMET` (with what is missing).
 * - `ConflictError` on a concurrent save.
 */
export function publishOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<PublishOccasionInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "occasion_operator",
    Occasion.publish,
  );
}
