import {
  type AccessBasis,
  type AccessDecision,
  AccessPolicy,
  type ActorAuthority,
  type RoleOperationKind,
  type TargetOperationKind,
  type TargetStanding,
} from "@repo/core/domain/authority/accessPolicy";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import {
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import type { Actor } from "@repo/core/domain/common/actor";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";

/** Arguments of a usecase that requires a signed-in `Actor`. */
export type ActorServiceArgs<T> = ServiceArgs<T> & Readonly<{ actor: Actor }>;

type RosterReader = Pick<AuthorityRepositories, "roleRosterRepository">;

/**
 * The target's stewardship as read for an access decision inside a unit
 * of work. `expectedVersion` is `null` when nothing is stored — the
 * target reads as vacant and a write must `insert`.
 */
export type TargetAccess<T extends StewardedRef = StewardedRef> = Readonly<{
  authority: ActorAuthority;
  stewardship: StewardshipOf<T>;
  expectedVersion: ExpectedVersion<Stewardship> | null;
  standing: TargetStanding;
}>;

/** The actor's roles (`RoleRosterRepository.findRolesOf`). */
export async function readActorAuthority(
  ctx: RosterReader,
  actor: Actor,
): Promise<ActorAuthority> {
  return {
    actor,
    roles: await ctx.roleRosterRepository.findRolesOf(actor.accountId),
  };
}

/**
 * Reads what `AccessPolicy` needs for an operation on `target`: the
 * actor's roles and the target's stewardship (vacant when none is
 * stored). Call it inside the same `run` as the writes, before them, so a
 * revocation or resignation committed first is reflected.
 */
export async function readTargetAccess<T extends StewardedRef>(
  ctx: AuthorityRepositories,
  actor: Actor,
  target: T,
): Promise<TargetAccess<T>> {
  const [authority, found] = await Promise.all([
    readActorAuthority(ctx, actor),
    ctx.stewardshipRepository.findById(target),
  ]);
  const stewardship = Stewardship.orVacant(found?.entity ?? null, target);
  return {
    authority,
    stewardship,
    expectedVersion: found?.expectedVersion ?? null,
    standing: Stewardship.standingOf(stewardship, actor.accountId),
  };
}

/** Throws `ForbiddenError` unless allowed; returns the basis otherwise. */
export function requireAllowed(decision: AccessDecision): AccessBasis {
  if (!decision.allowed) {
    throw new ForbiddenError("FORBIDDEN", "The operation is not allowed");
  }
  return decision.basis;
}

/**
 * `readTargetAccess` + `AccessPolicy.decide` for an operation on one
 * target; `ForbiddenError` when refused.
 */
export async function authorizeOnTarget<T extends StewardedRef>(
  ctx: AuthorityRepositories,
  actor: Actor,
  kind: TargetOperationKind,
  target: T,
): Promise<TargetAccess<T> & Readonly<{ basis: AccessBasis }>> {
  const access = await readTargetAccess(ctx, actor, target);
  const basis = requireAllowed(
    AccessPolicy.decide(access.authority, { kind, standing: access.standing }),
  );
  return { ...access, basis };
}

/**
 * Reads the actor's roles and decides a role-only operation
 * (`operate_service`, `edit_articles`); `ForbiddenError` when refused.
 */
export async function authorizeRole(
  ctx: RosterReader,
  actor: Actor,
  kind: RoleOperationKind,
): Promise<ActorAuthority> {
  const authority = await readActorAuthority(ctx, actor);
  requireAllowed(AccessPolicy.decide(authority, { kind }));
  return authority;
}

/**
 * Writes a changed stewardship: `insert` when none was stored (the first
 * write of a target), `save` against the version read otherwise.
 */
export function persistStewardship(
  ctx: Pick<AuthorityRepositories, "stewardshipRepository">,
  stewardship: Stewardship,
  expectedVersion: ExpectedVersion<Stewardship> | null,
): Promise<void> {
  return expectedVersion === null
    ? ctx.stewardshipRepository.insert(stewardship)
    : ctx.stewardshipRepository.save(stewardship, expectedVersion);
}
