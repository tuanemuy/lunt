import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { AccountId } from "@repo/core/domain/common/ids";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { ROLES } from "../role";
import { type OperatorRoster, RoleRoster } from "../roleRoster";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");

const account = (n: number) =>
  AccountId.create(
    `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`,
  );

const A = account(1);
const B = account(2);
const C = account(3);

function operators(...holders: AccountId[]): OperatorRoster {
  const [first, ...rest] = holders;
  if (first === undefined) return RoleRoster.initial("operator");
  let roster: OperatorRoster = RoleRoster.establishOperators(
    RoleRoster.initial("operator"),
    first,
    T0,
  ).entity;
  for (const holder of rest) {
    roster = RoleRoster.grant(roster, holder, T1).entity as OperatorRoster;
  }
  return roster;
}

const editors = (...holders: AccountId[]) =>
  holders.reduce<RoleRoster>(
    (roster, holder) => RoleRoster.grant(roster, holder, T1).entity,
    RoleRoster.initial("editor"),
  );

describe("RoleRoster", () => {
  it("ROLES lists every role", () => {
    expect(ROLES).toEqual(["editor", "operator"]);
  });

  it("initial is an unestablished operator roster, or an empty editor roster", () => {
    expect(RoleRoster.initial("operator")).toEqual({
      role: "operator",
      status: "unestablished",
      version: 0,
    });
    expect(RoleRoster.initial("editor")).toEqual({
      role: "editor",
      holders: [],
      version: 0,
    });
    expect(RoleRoster.holders(RoleRoster.initial("operator"))).toEqual([]);
  });

  describe("establishOperators", () => {
    it("establishes the first operator without drafts", () => {
      const { entity, eventDrafts } = RoleRoster.establishOperators(
        RoleRoster.initial("operator"),
        A,
        T0,
      );
      expect(entity).toEqual({
        role: "operator",
        status: "established",
        holders: [{ accountId: A, since: T0 }],
        version: 1,
      });
      expect(eventDrafts).toEqual([]);
    });

    it("returns the same roster for a resend by the sole holder", () => {
      const roster = operators(A);
      const { entity, eventDrafts } = RoleRoster.establishOperators(
        roster,
        A,
        T2,
      );
      expect(entity).toBe(roster);
      expect(eventDrafts).toEqual([]);
    });

    it.each([
      ["another account", [A], B],
      ["a holder among several", [A, B], A],
    ] as const)("refuses %s once established", (_label, holders, first) => {
      expectBusinessError(
        () => RoleRoster.establishOperators(operators(...holders), first, T2),
        "AUTHORITY_OPERATORS_ALREADY_ESTABLISHED",
      );
    });
  });

  describe("removal", () => {
    it.each([
      ["not_held for a non-holder", operators(A, B), C, "not_held"],
      ["last_operator for the sole operator", operators(A), A, "last_operator"],
      ["removable for one of two operators", operators(A, B), A, "removable"],
      ["removable for the last editor", editors(A), A, "removable"],
      ["not_held on an unestablished roster", operators(), A, "not_held"],
    ] as const)("is %s", (_label, roster, who, outcome) => {
      expect(RoleRoster.removal(roster, who)).toEqual({ outcome });
    });
  });

  describe("grant", () => {
    it("appends the holder and drafts role_granted", () => {
      const { entity, eventDrafts } = RoleRoster.grant(operators(A), B, T2);
      expect(RoleRoster.holders(entity)).toEqual([
        { accountId: A, since: T0 },
        { accountId: B, since: T2 },
      ]);
      expect(entity.version).toBe(2);
      expect(eventDrafts).toEqual([
        {
          type: "authority.role_granted",
          payload: { role: "operator", accountId: B },
          occurredAt: T2,
          aggregateId: "operator",
        },
      ]);
    });

    it("grants the editor role to the first editor", () => {
      const { entity } = RoleRoster.grant(RoleRoster.initial("editor"), A, T2);
      expect(RoleRoster.holders(entity)).toEqual([{ accountId: A, since: T2 }]);
    });

    it("refuses an unestablished operator roster", () => {
      expectBusinessError(
        () => RoleRoster.grant(RoleRoster.initial("operator"), A, T2),
        "AUTHORITY_OPERATORS_NOT_ESTABLISHED",
      );
    });

    it("refuses a holder", () => {
      expectBusinessError(
        () => RoleRoster.grant(editors(A), A, T2),
        "AUTHORITY_ROLE_ALREADY_HELD",
      );
    });
  });

  describe("removeHolder", () => {
    it("removes a holder and drafts role_revoked", () => {
      const { entity, eventDrafts } = RoleRoster.removeHolder(
        operators(A, B),
        A,
        "withdrawn",
        T2,
      );
      expect(RoleRoster.holders(entity)).toEqual([{ accountId: B, since: T1 }]);
      expect(eventDrafts).toEqual([
        {
          type: "authority.role_revoked",
          payload: { role: "operator", accountId: A, reason: "withdrawn" },
          occurredAt: T2,
          aggregateId: "operator",
        },
      ]);
    });

    it("lets the last editor go", () => {
      const { entity } = RoleRoster.removeHolder(editors(A), A, "revoked", T2);
      expect(RoleRoster.holders(entity)).toEqual([]);
    });

    it.each([
      ["AUTHORITY_ROLE_NOT_HELD", operators(A, B), C],
      ["AUTHORITY_LAST_OPERATOR", operators(A), A],
    ] as const)("refuses with %s", (code, roster, who) => {
      for (const reason of ["revoked", "withdrawn"] as const) {
        expectBusinessError(
          () => RoleRoster.removeHolder(roster, who, reason, T2),
          code,
        );
      }
    });
  });

  describe("reconstruct", () => {
    it.each([
      [
        { role: "operator", status: "unestablished", holders: [], version: 0 },
        RoleRoster.initial("operator"),
      ],
      [
        {
          role: "operator",
          status: "established",
          holders: [{ accountId: A, since: T0 }],
          version: 1,
        },
        operators(A),
      ],
      [
        {
          role: "editor",
          status: null,
          holders: [{ accountId: A, since: T1 }],
          version: 1,
        },
        editors(A),
      ],
    ])("rebuilds %j", (snapshot, expected) => {
      expect(RoleRoster.reconstruct(snapshot)).toEqual(expected);
    });

    it.each([
      { role: "admin", status: null, holders: [], version: 0 },
      { role: "operator", status: "established", holders: [], version: 1 },
      {
        role: "operator",
        status: "unestablished",
        holders: [{ accountId: A, since: T0 }],
        version: 1,
      },
      { role: "editor", status: "established", holders: [], version: 1 },
      {
        role: "editor",
        status: null,
        holders: [
          { accountId: A, since: T0 },
          { accountId: A, since: T1 },
        ],
        version: 1,
      },
    ])("refuses %j", (snapshot) => {
      let error: unknown;
      try {
        RoleRoster.reconstruct(snapshot);
      } catch (thrown) {
        error = thrown;
      }
      expect(isRehydrationError(error)).toBe(true);
    });
  });
});
