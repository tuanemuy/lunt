import type { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  transitionOccasion,
} from "./managedOccasion";

export type UnpublishOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * The occasion's operator unpublishes a published occasion
 * (`spec/usecases/occasion.md` 「unpublishOccasion」; EVT-06, EVT-13).
 * Emits `occasion.unpublished` (`byManager`). Participations and region
 * links are kept.
 *
 * - `NotFoundError`, checked before access; `ForbiddenError`
 *   (`manage_target`).
 * - `BusinessRuleError`, in this order: `OCCASION_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION` (not published).
 * - `ConflictError` on a concurrent save.
 */
export function unpublishOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<UnpublishOccasionInput>): Promise<ManagedOccasionView> {
  return transitionOccasion(
    container,
    actor,
    input.occasionId,
    "occasion_operator",
    Occasion.unpublish,
  );
}
