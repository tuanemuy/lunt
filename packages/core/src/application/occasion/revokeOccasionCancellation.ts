import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type RevokeOccasionCancellationInput = Readonly<{
  occasionId: OccasionId;
}>;

/**
 * The occasion's operator revokes the cancellation, also past the period
 * and while suspended (`spec/usecases/occasion.md`
 * 「revokeOccasionCancellation」; EVT-11, EVT-13). The holding status
 * follows the period and today again. No domain event; lapsed
 * applications stay lapsed.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`manage_target`).
 * - `BusinessRuleError`: `OCCASION_NOT_CANCELLED`.
 * - `ConflictError` on a concurrent revocation or save.
 */
export function revokeOccasionCancellation({
  container,
  actor,
  input,
}: ActorServiceArgs<RevokeOccasionCancellationInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "occasion_operator",
    Occasion.revokeCancellation,
  );
}
