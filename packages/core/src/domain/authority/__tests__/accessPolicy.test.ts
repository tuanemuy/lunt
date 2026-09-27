import { AccountId, PlaceId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import {
  type AccessDecision,
  AccessPolicy,
  type ActorAuthority,
  type TargetOperationKind,
  type TargetStanding,
} from "../accessPolicy";
import type { Role } from "../role";

const target: StewardedRef = {
  kind: "place",
  id: PlaceId.create("ffffffff-ffff-7fff-8fff-000000000100"),
};
const actor = {
  accountId: AccountId.create("ffffffff-ffff-7fff-8fff-000000000001"),
};

const STANDINGS = {
  steward: { target, status: "stewarded", actorIsSteward: true },
  other: { target, status: "stewarded", actorIsSteward: false },
  vacant: { target, status: "vacant" },
} as const satisfies Record<string, TargetStanding>;

type StandingName = keyof typeof STANDINGS;

const ROLE_SETS = {
  none: [],
  operator: ["operator"],
  editor: ["editor"],
  both: ["operator", "editor"],
} as const satisfies Record<string, readonly Role[]>;

type RoleSetName = keyof typeof ROLE_SETS;

const authority = (roles: RoleSetName): ActorAuthority => ({
  actor,
  roles: new Set<Role>(ROLE_SETS[roles]),
});

const DENY = { allowed: false } as const;
const as = (basis: "steward" | "absence_proxy" | "role"): AccessDecision => ({
  allowed: true,
  basis,
});

/**
 * Expected decision per standing, for the actor without roles, as
 * operator, as editor and holding both — `spec/domains/authority.md`
 * 「AccessPolicy」, row by row.
 */
const TARGET_TABLE: Record<
  TargetOperationKind,
  Record<StandingName, Record<RoleSetName, AccessDecision>>
> = {
  manage_target: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: DENY, editor: DENY, both: DENY },
    vacant: {
      none: DENY,
      operator: as("absence_proxy"),
      editor: DENY,
      both: as("absence_proxy"),
    },
  },
  inspect_target: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: as("role"), editor: DENY, both: as("role") },
    vacant: {
      none: DENY,
      operator: as("absence_proxy"),
      editor: DENY,
      both: as("absence_proxy"),
    },
  },
  view_members: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: as("role"), editor: DENY, both: as("role") },
    vacant: {
      none: DENY,
      operator: as("role"),
      editor: DENY,
      both: as("role"),
    },
  },
  act_as_place: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: DENY, editor: DENY, both: DENY },
    vacant: { none: DENY, operator: DENY, editor: DENY, both: DENY },
  },
  invite_member: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: DENY, editor: DENY, both: DENY },
    vacant: { none: DENY, operator: DENY, editor: DENY, both: DENY },
  },
  resign: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: DENY, editor: DENY, both: DENY },
    vacant: { none: DENY, operator: DENY, editor: DENY, both: DENY },
  },
  cancel_invitation: {
    steward: {
      none: as("steward"),
      operator: as("steward"),
      editor: as("steward"),
      both: as("steward"),
    },
    other: { none: DENY, operator: DENY, editor: DENY, both: DENY },
    vacant: {
      none: DENY,
      operator: as("absence_proxy"),
      editor: DENY,
      both: as("absence_proxy"),
    },
  },
};

describe("AccessPolicy.decide", () => {
  for (const [kind, byStanding] of Object.entries(TARGET_TABLE)) {
    for (const [standing, byRoles] of Object.entries(byStanding)) {
      for (const [roles, expected] of Object.entries(byRoles)) {
        it(`${kind} on a ${standing} target with roles ${roles}`, () => {
          expect(
            AccessPolicy.decide(authority(roles as RoleSetName), {
              kind: kind as TargetOperationKind,
              standing: STANDINGS[standing as StandingName],
            }),
          ).toEqual(expected);
        });
      }
    }
  }

  it.each([
    ["none", DENY],
    ["operator", as("role")],
    ["editor", DENY],
    ["both", as("role")],
  ] as const)("operate_service with roles %s", (roles, expected) => {
    expect(
      AccessPolicy.decide(authority(roles), { kind: "operate_service" }),
    ).toEqual(expected);
  });

  it.each([
    ["none", DENY],
    ["operator", DENY],
    ["editor", as("role")],
    ["both", as("role")],
  ] as const)("edit_articles with roles %s", (roles, expected) => {
    expect(
      AccessPolicy.decide(authority(roles), { kind: "edit_articles" }),
    ).toEqual(expected);
  });
});
