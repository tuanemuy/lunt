import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { AccountId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { AuthorityErrorCode } from "./errorCode";
import {
  type AuthorityEvent,
  AuthorityEvents,
  type RoleRemovalReason,
} from "./events";
import { Role } from "./role";

export type RoleHolder = Readonly<{ accountId: AccountId; since: Date }>;

/** Before the service's opening set-up: no operator exists yet. */
export type UnestablishedOperatorRoster = Readonly<{
  role: "operator";
  status: "unestablished";
  version: Version;
}>;

/** An established operator roster never drops to zero holders. */
export type EstablishedOperatorRoster = Readonly<{
  role: "operator";
  status: "established";
  holders: readonly [RoleHolder, ...RoleHolder[]];
  version: Version;
}>;

export type OperatorRoster =
  | UnestablishedOperatorRoster
  | EstablishedOperatorRoster;

/** Editors may drop to zero. */
export type EditorRoster = Readonly<{
  role: "editor";
  holders: readonly RoleHolder[];
  version: Version;
}>;

/**
 * The holders of one role (集約。ID は `role`). Holders are oldest grant
 * first with no duplicate `accountId`.
 */
export type RoleRoster = OperatorRoster | EditorRoster;

export type RosterOf<R extends Role> = R extends "operator"
  ? OperatorRoster
  : EditorRoster;

export type RoleRemoval =
  | Readonly<{ outcome: "removable" }>
  | Readonly<{ outcome: "not_held" }>
  | Readonly<{ outcome: "last_operator" }>;

type Result<R extends RoleRoster = RoleRoster> = WithEventDrafts<
  R,
  AuthorityEvent
>;

/** The roster of `role` while none is stored. */
function initial<R extends Role>(role: R): RosterOf<R>;
function initial(role: Role): RoleRoster {
  return role === "operator"
    ? { role, status: "unestablished", version: Version.initial() }
    : { role, holders: [], version: Version.initial() };
}

function holders(roster: RoleRoster): readonly RoleHolder[] {
  return roster.role === "operator" && roster.status === "unestablished"
    ? []
    : roster.holders;
}

const holds = (roster: RoleRoster, accountId: AccountId): boolean =>
  holders(roster).some((holder) => holder.accountId === accountId);

/**
 * The opening set-up only: makes an unestablished operator roster hold
 * `first` alone. Re-sending the same set-up returns the roster unchanged
 * (same version, no drafts). Never drafts `authority.role_granted`.
 */
function establishOperators(
  roster: OperatorRoster,
  first: AccountId,
  now: Date,
): Result<OperatorRoster> {
  if (roster.status === "unestablished") {
    return {
      entity: {
        role: "operator",
        status: "established",
        holders: [{ accountId: first, since: now }],
        version: Version.next(roster.version),
      },
      eventDrafts: [],
    };
  }
  if (roster.holders.length === 1 && roster.holders[0].accountId === first) {
    return { entity: roster, eventDrafts: [] };
  }
  throw new BusinessRuleError(
    AuthorityErrorCode.OperatorsAlreadyEstablished,
    "The operators are already established",
  );
}

/**
 * Whether `accountId` can be removed from the roster. The only place that
 * decides it: used by `removeHolder`, by withdrawal (to pick the rosters
 * to remove from) and by the withdrawal preview.
 */
function removal(roster: RoleRoster, accountId: AccountId): RoleRemoval {
  if (!holds(roster, accountId)) return { outcome: "not_held" };
  if (roster.role === "operator" && holders(roster).length === 1) {
    return { outcome: "last_operator" };
  }
  return { outcome: "removable" };
}

/** Grants the role; anyone may be granted, the granting operator included. */
function grant(roster: RoleRoster, accountId: AccountId, now: Date): Result {
  if (roster.role === "operator" && roster.status === "unestablished") {
    throw new BusinessRuleError(
      AuthorityErrorCode.OperatorsNotEstablished,
      "The operators are not established yet",
    );
  }
  if (holds(roster, accountId)) {
    throw new BusinessRuleError(
      AuthorityErrorCode.RoleAlreadyHeld,
      "The account already holds the role",
    );
  }
  const version = Version.next(roster.version);
  const [first, ...rest] = [...holders(roster), { accountId, since: now }];
  const entity: RoleRoster =
    roster.role === "editor"
      ? { role: "editor", holders: [first, ...rest], version }
      : {
          role: "operator",
          status: "established",
          holders: [first, ...rest],
          version,
        };
  return {
    entity,
    eventDrafts: [AuthorityEvents.roleGranted(roster.role, accountId, now)],
  };
}

/**
 * Removes a holder (revocation or withdrawal). The last operator is never
 * removed, whatever the reason.
 */
function removeHolder(
  roster: RoleRoster,
  accountId: AccountId,
  reason: RoleRemovalReason,
  now: Date,
): Result {
  const verdict = removal(roster, accountId);
  if (verdict.outcome === "not_held") {
    throw new BusinessRuleError(
      AuthorityErrorCode.RoleNotHeld,
      "The account does not hold the role",
    );
  }
  if (verdict.outcome === "last_operator") {
    throw new BusinessRuleError(
      AuthorityErrorCode.LastOperator,
      "The last operator cannot be removed",
    );
  }
  const version = Version.next(roster.version);
  const remaining = holders(roster).filter(
    (holder) => holder.accountId !== accountId,
  );
  let entity: RoleRoster;
  if (roster.role === "editor") {
    entity = { ...roster, holders: remaining, version };
  } else {
    const [first, ...rest] = remaining;
    if (first === undefined) {
      throw new Error("A removable operator must leave another operator");
    }
    entity = {
      role: "operator",
      status: "established",
      holders: [first, ...rest],
      version,
    };
  }
  return {
    entity,
    eventDrafts: [
      AuthorityEvents.roleRevoked(roster.role, accountId, reason, now),
    ],
  };
}

export type RoleRosterSnapshot = Readonly<{
  role: string;
  status: string | null;
  holders: readonly Readonly<{ accountId: string; since: Date }>[];
  version: number;
}>;

function reconstruct(input: RoleRosterSnapshot): RoleRoster {
  try {
    const list: RoleHolder[] = input.holders.map((holder) => {
      const since = new Date(holder.since);
      if (Number.isNaN(since.getTime())) throw new Error("Invalid date");
      return { accountId: AccountId.create(holder.accountId), since };
    });
    if (new Set(list.map((holder) => holder.accountId)).size !== list.length) {
      throw new Error("Duplicate holder");
    }
    const version = Version.create(input.version);
    if (!Role.is(input.role)) throw new Error(`Unknown role: ${input.role}`);
    if (input.role === "editor") {
      if (input.status !== null) throw new Error("Editors have no status");
      return { role: "editor", holders: list, version };
    }
    const [first, ...rest] = list;
    if (input.status === "unestablished" && first === undefined) {
      return { role: "operator", status: "unestablished", version };
    }
    if (input.status === "established" && first !== undefined) {
      return {
        role: "operator",
        status: "established",
        holders: [first, ...rest],
        version,
      };
    }
    throw new Error(
      `Operator status ${input.status} does not match ${list.length} holders`,
    );
  } catch (error) {
    throw new RehydrationError("Stored role roster violates invariants", error);
  }
}

export const RoleRoster = {
  initial,
  establishOperators,
  holders,
  holds,
  removal,
  grant,
  removeHolder,
  reconstruct,
};
