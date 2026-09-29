import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type SuspendOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * An operator suspends an occasion in any publication state, with or
 * without an occasion operator (`spec/usecases/occasion.md`
 * 「suspendOccasion」; MOD-07). The publication and the cancellation are
 * kept. Emits `occasion.suspended`.
 *
 * - `ForbiddenError` (`operate_service`, also when revoked before the
 *   commit); `NotFoundError`.
 * - `BusinessRuleError`: `OCCASION_ALREADY_SUSPENDED`.
 * - `ConflictError` on a concurrent save.
 */
export function suspendOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<SuspendOccasionInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "service_operator",
    Occasion.suspend,
  );
}
