import { AccessPolicy } from "@repo/core/domain/authority/accessPolicy";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import type { Actor } from "@repo/core/domain/common/actor";
import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { authorizeOnTarget, readTargetAccess } from "../authority/access";

/** Which stance allowed a read open to both sides of a participation. */
export type ParticipationSide = "place" | "occasion";

/**
 * 「店舗管理者、またはイベントの運営者。どちらかで行えれば成立する」
 * (`spec/usecases/occasion.md` getParticipationDetails / listAttachableListings):
 * `act_as_place` on the place when it allows, else `manage_target` on the
 * occasion. `ForbiddenError` when neither does. The decision that allowed
 * is recorded through `authorizeOnTarget` (D-17).
 */
export async function authorizeAsPlaceOrOccasion(
  ctx: AuthorityRepositories,
  actor: Actor,
  placeId: PlaceId,
  occasionId: OccasionId,
): Promise<ParticipationSide> {
  const place = { kind: "place", id: placeId } as const;
  const access = await readTargetAccess(ctx, actor, place);
  const asPlace = AccessPolicy.decide(access.authority, {
    kind: "act_as_place",
    standing: access.standing,
  });
  if (asPlace.allowed) {
    await authorizeOnTarget(ctx, actor, "act_as_place", place);
    return "place";
  }
  await authorizeOnTarget(ctx, actor, "manage_target", {
    kind: "occasion",
    id: occasionId,
  });
  return "occasion";
}
