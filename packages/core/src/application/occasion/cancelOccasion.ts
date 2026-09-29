import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type CancelOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * The occasion's operator calls the occasion off, whatever its holding
 * status, publication or suspension (`spec/usecases/occasion.md`
 * 「cancelOccasion」; EVT-11, EVT-13). Emits `occasion.cancelled`;
 * participations are kept (pending applications lapse through the event).
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`manage_target`).
 * - `BusinessRuleError`: `OCCASION_ALREADY_CANCELLED`.
 * - `ConflictError` on a concurrent cancel or save.
 */
export function cancelOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<CancelOccasionInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "occasion_operator",
    Occasion.cancel,
  );
}
