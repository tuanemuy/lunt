import { AccessPolicy } from "@repo/core/domain/authority/accessPolicy";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { Actor } from "@repo/core/domain/common/actor";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import { authorizeOnTarget, readActorAuthority } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import type { ActorServiceArgs } from "../types";
import {
  type ApplicationSummary,
  readSummaryReads,
  summarizeAll,
} from "./views";

const PAGE_SIZE = 100;

export type ListMyApplicationsInput = Readonly<{
  /** Only the applications made as this place's steward (from SM-01/05/06). */
  placeId?: PlaceId | null;
  pagination: Pagination;
}>;

export type MyApplications = Readonly<{
  /** Newest submission first, then id. */
  items: readonly ApplicationSummary[];
  count: number;
  /** The place the list is narrowed to, with its current name. */
  place: Readonly<{ id: PlaceId; name: string | null }> | null;
}>;

/** The places the actor may act for as a steward (`act_as_place`), all of them. */
async function placesActedFor(
  ctx: AuthorityRepositories,
  actor: Actor,
): Promise<readonly PlaceId[]> {
  const authority = await readActorAuthority(ctx, actor);
  const places: PlaceId[] = [];
  for (let page = 1; ; page += 1) {
    const result = await ctx.stewardshipRepository.findPageBySteward(
      actor.accountId,
      { page, limit: PAGE_SIZE },
    );
    for (const { entity } of result.items) {
      if (entity.target.kind !== "place") continue;
      const decision = AccessPolicy.decide(authority, {
        kind: "act_as_place",
        standing: Stewardship.standingOf(entity, actor.accountId),
      });
      if (decision.allowed) places.push(entity.target.id);
    }
    if (result.items.length < PAGE_SIZE) return places;
  }
}

/**
 * The actor's applications (APP-01, APP-06, MY-04): those made as an
 * individual and those made as the steward of a place they steward now —
 * whichever steward filed them — in any status, newest first. A place
 * resigned from or revoked drops its applications. A companion claim is a
 * row of its own. Narrowed to one place, only that place's applications
 * made as its steward.
 *
 * - `NotFoundError` (`PLACE_NOT_FOUND`) when narrowed to a place that does
 *   not exist, checked before access.
 * - `ForbiddenError` when narrowed to a place the actor may not act for.
 * - `COMMON_INVALID_INPUT` on a bad pagination.
 */
export async function listMyApplications({
  container,
  actor,
  input,
}: ActorServiceArgs<ListMyApplicationsInput>): Promise<MyApplications> {
  const pagination = Pagination.create(input.pagination);
  const placeId = input.placeId ?? null;
  if (placeId !== null) {
    await requireExistingTarget(container.stewardedTargetDirectory, {
      kind: "place",
      id: placeId,
    });
  }
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const criteria =
      placeId === null
        ? {
            individual: actor.accountId,
            places: await placesActedFor(ctx, actor),
          }
        : await authorizeOnTarget(ctx, actor, "act_as_place", {
            kind: "place",
            id: placeId,
          }).then(() => ({ individual: null, places: [placeId] }));
    const page = await ctx.applicationRepository.findPageByApplicants(
      criteria,
      pagination,
    );
    return { page, reads: await readSummaryReads(ctx, page.items) };
  });
  const [items, place] = await Promise.all([
    summarizeAll(container.contentDirectory, read.page.items, read.reads),
    placeId === null
      ? null
      : container.contentDirectory
          .describe([{ kind: "place", id: placeId }])
          .then(([summary]) => ({ id: placeId, name: summary?.name ?? null })),
  ]);
  return { items, count: read.page.count, place };
}
