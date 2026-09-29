import type { OccasionId } from "@repo/core/domain/common/ids";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type ManagedOccasionView,
  occasionRef,
  presentManagedOccasion,
  requireOccasion,
} from "./managedOccasion";

export type GetManagedOccasionInput = Readonly<{ occasionId: OccasionId }>;

/**
 * One occasion for its operators and for a service operator opening it by
 * id (`spec/usecases/occasion.md` 「getManagedOccasion」; EVT-04 … EVT-13,
 * MOD-07; the management navigation of EM, CM-01, CM-02, CM-04): content,
 * publication (with its reason), suspension, cancellation, today's
 * holding status, whether viewers can see it, the missing publish
 * requirements, whether a takedown removed photos, whether it has an
 * occasion operator, and whether the actor may manage it and on what
 * basis (`steward` / `absence_proxy`). Occasions viewers cannot see are
 * returned too.
 *
 * - `ForbiddenError` (`inspect_target`); `NotFoundError`.
 */
export async function getManagedOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<GetManagedOccasionInput>): Promise<ManagedOccasionView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const access = await authorizeOnTarget(
      ctx,
      actor,
      "inspect_target",
      occasionRef(input.occasionId),
    );
    const found = await requireOccasion(ctx, input.occasionId);
    return { occasion: found.entity, access };
  });
  return presentManagedOccasion(container, read);
}
