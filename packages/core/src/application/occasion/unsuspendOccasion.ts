import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type UnsuspendOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * An operator lifts the suspension (`spec/usecases/occasion.md`
 * 「unsuspendOccasion」; MOD-07). The publication state shows as it is — an
 * occasion whose last photo was taken down meanwhile stays `unpublished`
 * (`photoTakedown`). Emits `occasion.unsuspended`.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`operate_service`).
 * - `BusinessRuleError`: `OCCASION_NOT_SUSPENDED`.
 * - `ConflictError` on a concurrent save.
 */
export function unsuspendOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<UnsuspendOccasionInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "service_operator",
    Occasion.unsuspend,
  );
}
