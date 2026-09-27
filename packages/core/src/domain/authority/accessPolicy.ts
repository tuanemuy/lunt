import type { Actor } from "@repo/core/domain/common/actor";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { Role } from "./role";

/**
 * The target's stewardship as seen by the actor (`Stewardship.standingOf`).
 */
export type TargetStanding =
  | Readonly<{
      target: StewardedRef;
      status: "stewarded";
      actorIsSteward: boolean;
    }>
  | Readonly<{ target: StewardedRef; status: "vacant" }>;

/** The actor's roles. */
export type ActorAuthority = Readonly<{
  actor: Actor;
  roles: ReadonlySet<Role>;
}>;

/** Operation kinds judged against one target's standing. */
export type TargetOperationKind =
  | "manage_target"
  | "inspect_target"
  | "act_as_place"
  | "view_members"
  | "invite_member"
  | "cancel_invitation"
  | "resign";

/** Operation kinds judged by roles alone. */
export type RoleOperationKind = "operate_service" | "edit_articles";

/**
 * The kind of operation whose permission is decided. Which user-facing
 * operation maps to which kind is fixed by `spec/domains/index.md`
 * 「操作の可否」 only. For an operation on a listing, pass the standing of
 * the place the listing belongs to.
 */
export type Operation =
  | Readonly<{ kind: TargetOperationKind; standing: TargetStanding }>
  | Readonly<{ kind: RoleOperationKind }>;

/**
 * Why an operation was allowed: as the target's steward, as the operator
 * standing in for an absent steward (不在の代行), or by a role.
 */
export type AccessBasis = "steward" | "absence_proxy" | "role";

export type AccessDecision =
  | Readonly<{ allowed: true; basis: AccessBasis }>
  | Readonly<{ allowed: false }>;

const allow = (basis: AccessBasis): AccessDecision => ({
  allowed: true,
  basis,
});
const DENY: AccessDecision = { allowed: false };

const isSteward = (standing: TargetStanding): boolean =>
  standing.status === "stewarded" && standing.actorIsSteward;

function decideOnTarget(
  kind: TargetOperationKind,
  standing: TargetStanding,
  roles: ReadonlySet<Role>,
): AccessDecision {
  if (isSteward(standing)) return allow("steward");
  const operator = roles.has("operator");
  const vacant = standing.status === "vacant";
  switch (kind) {
    case "manage_target":
    case "cancel_invitation":
      return vacant && operator ? allow("absence_proxy") : DENY;
    case "inspect_target":
      if (vacant && operator) return allow("absence_proxy");
      return operator ? allow("role") : DENY;
    case "view_members":
      return operator ? allow("role") : DENY;
    case "act_as_place":
    case "invite_member":
    case "resign":
      return DENY;
  }
}

/**
 * Decides whether the actor may perform `operation` — the only place the
 * rules of `spec/domains/authority.md` 「AccessPolicy」 live. Pure; never
 * throws. Holding several roles never widens a target's rules: a
 * non-steward operator cannot manage a stewarded target, and an operator
 * without the editor role cannot edit articles. Usecases throw
 * `ForbiddenError` on `allowed: false` and never branch on `basis`.
 */
function decide(
  authority: ActorAuthority,
  operation: Operation,
): AccessDecision {
  switch (operation.kind) {
    case "operate_service":
      return authority.roles.has("operator") ? allow("role") : DENY;
    case "edit_articles":
      return authority.roles.has("editor") ? allow("role") : DENY;
    default:
      return decideOnTarget(
        operation.kind,
        operation.standing,
        authority.roles,
      );
  }
}

export const AccessPolicy = { decide };
