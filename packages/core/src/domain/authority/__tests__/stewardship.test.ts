import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  AccountId,
  InvitationId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  type Appointee,
  type GrantableRef,
  type PlaceRef,
  Stewardship,
  type StewardshipOf,
} from "../stewardship";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");

const id = (n: number) =>
  `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`;

const person = (n: number): Appointee => ({
  accountId: AccountId.create(id(n)),
  email: EmailAddress.create(`user${n}@example.com`),
});

const A = person(1);
const B = person(2);
const C = person(3);
const D = person(4);

const place: PlaceRef = { kind: "place", id: PlaceId.create(id(100)) };
const region: GrantableRef = { kind: "region", id: RegionId.create(id(200)) };

const inv = (n: number) => InvitationId.create(id(1000 + n));

/** P with A (T0) and B (T1) as stewards. */
function stewardedPlace(): StewardshipOf<PlaceRef> {
  const first = Stewardship.appointByApproval(
    Stewardship.vacant(place),
    A,
    T0,
  ).entity;
  return Stewardship.appointByApproval(first, B, T1).entity;
}

function invited<T extends StewardedRef>(
  s: StewardshipOf<T>,
  n: number,
  who: Appointee,
  at: Date = T1,
): StewardshipOf<T> {
  return Stewardship.invite(
    s,
    { invitationId: inv(n), email: who.email },
    null,
    at,
  ).entity;
}

describe("Stewardship", () => {
  it("vacant has no stewards, no invitations and the initial version", () => {
    const s = Stewardship.vacant(place);
    expect(s).toEqual({
      target: place,
      status: "vacant",
      invitations: [],
      version: 0,
    });
    expect(Stewardship.isVacant(s)).toBe(true);
    expect(Stewardship.stewards(s)).toEqual([]);
  });

  it("orVacant returns the stored one, or vacant when none is stored", () => {
    const stored = stewardedPlace();
    expect(Stewardship.orVacant(stored, place)).toBe(stored);
    expect(Stewardship.orVacant(null, region)).toEqual(
      Stewardship.vacant(region),
    );
    expect(() => Stewardship.orVacant(stored, region)).toThrow();
  });

  describe("removal", () => {
    it("is not_a_steward for a non-steward", () => {
      expect(Stewardship.removal(stewardedPlace(), C.accountId)).toEqual({
        outcome: "not_a_steward",
      });
      expect(
        Stewardship.removal(Stewardship.vacant(place), A.accountId),
      ).toEqual({ outcome: "not_a_steward" });
    });

    it("vacates only for the sole steward", () => {
      const both = stewardedPlace();
      expect(Stewardship.removal(both, A.accountId)).toEqual({
        outcome: "removable",
        vacates: false,
      });
      const sole = Stewardship.removeSteward(
        both,
        B.accountId,
        "resigned",
        T2,
      ).entity;
      expect(Stewardship.removal(sole, A.accountId)).toEqual({
        outcome: "removable",
        vacates: true,
      });
    });
  });

  it("standingOf tells steward, non-steward and vacant apart", () => {
    const s = stewardedPlace();
    expect(Stewardship.standingOf(s, A.accountId)).toEqual({
      target: place,
      status: "stewarded",
      actorIsSteward: true,
    });
    expect(Stewardship.standingOf(s, C.accountId)).toEqual({
      target: place,
      status: "stewarded",
      actorIsSteward: false,
    });
    expect(
      Stewardship.standingOf(Stewardship.vacant(place), A.accountId),
    ).toEqual({ target: place, status: "vacant" });
  });

  describe("classifyInvite", () => {
    const s = invited(stewardedPlace(), 1, C);
    it.each([
      ["new", { invitationId: inv(2), email: D.email }],
      ["replay", { invitationId: inv(1), email: C.email }],
      ["conflict", { invitationId: inv(1), email: D.email }],
    ] as const)("%s", (expected, params) => {
      expect(Stewardship.classifyInvite(s, params)).toBe(expected);
    });
  });

  describe("invite", () => {
    it("adds the invitation last and drafts invitation_issued", () => {
      const before = invited(stewardedPlace(), 1, C);
      const { entity, eventDrafts } = Stewardship.invite(
        before,
        { invitationId: inv(2), email: D.email },
        D.accountId,
        T2,
      );
      expect(entity.invitations.map((i) => i.email)).toEqual([
        C.email,
        D.email,
      ]);
      expect(entity.invitations[1]).toEqual({
        id: inv(2),
        email: D.email,
        invitedAt: T2,
      });
      expect(entity.version).toBe(before.version + 1);
      expect(Stewardship.stewards(entity)).toEqual(
        Stewardship.stewards(before),
      );
      expect(eventDrafts).toEqual([
        {
          type: "authority.invitation_issued",
          payload: { target: place, invitationId: inv(2), email: D.email },
          occurredAt: T2,
          aggregateId: `place:${place.id}`,
        },
      ]);
    });

    it("works for an address without an account and on a vacant target", () => {
      const { entity } = Stewardship.invite(
        Stewardship.vacant(region),
        { invitationId: inv(1), email: C.email },
        null,
        T1,
      );
      expect(entity.status).toBe("vacant");
      expect(entity.invitations).toHaveLength(1);
    });

    it("refuses an addressee who is already a steward", () => {
      expectBusinessError(
        () =>
          Stewardship.invite(
            stewardedPlace(),
            { invitationId: inv(1), email: B.email },
            B.accountId,
            T2,
          ),
        "AUTHORITY_ALREADY_STEWARD",
      );
    });

    it("refuses a second pending invitation to the same address", () => {
      expectBusinessError(
        () =>
          Stewardship.invite(
            invited(stewardedPlace(), 1, C),
            { invitationId: inv(2), email: C.email },
            null,
            T2,
          ),
        "AUTHORITY_INVITATION_ALREADY_PENDING",
      );
    });
  });

  describe("cancelInvitation", () => {
    it("removes the invitation without an event", () => {
      const before = invited(invited(stewardedPlace(), 1, C), 2, D);
      const { entity, eventDrafts } = Stewardship.cancelInvitation(
        before,
        inv(1),
      );
      expect(entity.invitations.map((i) => i.id)).toEqual([inv(2)]);
      expect(entity.version).toBe(before.version + 1);
      expect(eventDrafts).toEqual([]);
    });

    it("refuses a missing invitation", () => {
      expectBusinessError(
        () => Stewardship.cancelInvitation(stewardedPlace(), inv(9)),
        "AUTHORITY_INVITATION_NOT_FOUND",
      );
    });
  });

  describe("invitationStatusFor", () => {
    const s = invited(stewardedPlace(), 1, C);
    it("is already_steward first, even for a missing invitation", () => {
      expect(Stewardship.invitationStatusFor(s, inv(9), A)).toBe(
        "already_steward",
      );
    });
    it("is not_found for a missing invitation", () => {
      expect(Stewardship.invitationStatusFor(s, inv(9), C)).toBe("not_found");
    });
    it("is addressed_to_other for another address", () => {
      expect(Stewardship.invitationStatusFor(s, inv(1), D)).toBe(
        "addressed_to_other",
      );
    });
    it("is acceptable for the invitee", () => {
      expect(Stewardship.invitationStatusFor(s, inv(1), C)).toBe("acceptable");
    });
  });

  describe("acceptInvitation", () => {
    it("appends the acceptor, drops only their invitation and drafts steward_appointed", () => {
      const before = invited(invited(stewardedPlace(), 1, C), 2, D);
      const { entity, eventDrafts } = Stewardship.acceptInvitation(
        before,
        inv(1),
        C,
        T2,
      );
      expect(Stewardship.stewards(entity)).toEqual([
        { accountId: A.accountId, since: T0 },
        { accountId: B.accountId, since: T1 },
        { accountId: C.accountId, since: T2 },
      ]);
      expect(entity.invitations.map((i) => i.email)).toEqual([D.email]);
      expect(eventDrafts).toEqual([
        {
          type: "authority.steward_appointed",
          payload: { target: place, accountId: C.accountId, via: "invitation" },
          occurredAt: T2,
          aggregateId: `place:${place.id}`,
        },
      ]);
    });

    it("makes a vacant target stewarded", () => {
      const { entity } = Stewardship.acceptInvitation(
        invited(Stewardship.vacant(region), 1, C),
        inv(1),
        C,
        T2,
      );
      expect(entity.status).toBe("stewarded");
      expect(Stewardship.stewards(entity)).toEqual([
        { accountId: C.accountId, since: T2 },
      ]);
    });

    it.each([
      ["AUTHORITY_ALREADY_STEWARD", inv(1), A],
      ["AUTHORITY_INVITATION_NOT_FOUND", inv(9), C],
      ["AUTHORITY_INVITATION_EMAIL_MISMATCH", inv(1), D],
    ] as const)("refuses with %s", (code, invitationId, who) => {
      expectBusinessError(
        () =>
          Stewardship.acceptInvitation(
            invited(stewardedPlace(), 1, C),
            invitationId,
            who,
            T2,
          ),
        code,
      );
    });
  });

  describe("appointByApproval and grant", () => {
    it("appointByApproval appoints via application", () => {
      const { entity, eventDrafts } = Stewardship.appointByApproval(
        Stewardship.vacant(place),
        C,
        T2,
      );
      expect(entity.status).toBe("stewarded");
      expect(eventDrafts[0]?.payload).toEqual({
        target: place,
        accountId: C.accountId,
        via: "application",
      });
    });

    it("grant appoints via grant and drops the grantee's invitation", () => {
      const { entity, eventDrafts } = Stewardship.grant(
        invited(invited(Stewardship.vacant(region), 1, C), 2, D),
        C,
        T2,
      );
      expect(Stewardship.stewards(entity)).toEqual([
        { accountId: C.accountId, since: T2 },
      ]);
      expect(entity.invitations.map((i) => i.email)).toEqual([D.email]);
      expect(eventDrafts[0]?.payload).toEqual({
        target: region,
        accountId: C.accountId,
        via: "grant",
      });
    });

    it("both refuse an existing steward", () => {
      const s = Stewardship.grant(Stewardship.vacant(region), A, T0).entity;
      expectBusinessError(
        () => Stewardship.grant(s, A, T1),
        "AUTHORITY_ALREADY_STEWARD",
      );
      expectBusinessError(
        () => Stewardship.appointByApproval(stewardedPlace(), A, T2),
        "AUTHORITY_ALREADY_STEWARD",
      );
    });
  });

  describe("removeSteward", () => {
    it("removes a non-last steward and stays stewarded", () => {
      const { entity, eventDrafts } = Stewardship.removeSteward(
        stewardedPlace(),
        A.accountId,
        "resigned",
        T2,
      );
      expect(entity.status).toBe("stewarded");
      expect(Stewardship.stewards(entity)).toEqual([
        { accountId: B.accountId, since: T1 },
      ]);
      expect(eventDrafts.map((d) => d.type)).toEqual([
        "authority.steward_removed",
      ]);
      expect(eventDrafts[0]?.payload).toEqual({
        target: place,
        accountId: A.accountId,
        reason: "resigned",
      });
    });

    it("vacates on the last steward, keeps the invitations and drafts stewardship_vacated too", () => {
      const sole = Stewardship.grant(Stewardship.vacant(region), A, T0).entity;
      const { entity, eventDrafts } = Stewardship.removeSteward(
        invited(sole, 1, C),
        A.accountId,
        "revoked",
        T2,
      );
      expect(entity.status).toBe("vacant");
      expect(entity.invitations.map((i) => i.email)).toEqual([C.email]);
      expect(eventDrafts).toEqual([
        {
          type: "authority.steward_removed",
          payload: {
            target: region,
            accountId: A.accountId,
            reason: "revoked",
          },
          occurredAt: T2,
          aggregateId: `region:${region.id}`,
        },
        {
          type: "authority.stewardship_vacated",
          payload: { target: region },
          occurredAt: T2,
          aggregateId: `region:${region.id}`,
        },
      ]);
    });

    it("refuses a non-steward", () => {
      expectBusinessError(
        () =>
          Stewardship.removeSteward(
            stewardedPlace(),
            C.accountId,
            "withdrawn",
            T2,
          ),
        "AUTHORITY_NOT_A_STEWARD",
      );
    });
  });

  describe("reconstruct", () => {
    const snapshot = {
      target: { kind: "place", id: place.id },
      status: "stewarded",
      stewards: [{ accountId: A.accountId, since: T0 }],
      invitations: [{ id: inv(1), email: C.email, invitedAt: T1 }],
      version: 3,
    };

    it("rebuilds a valid snapshot", () => {
      expect(Stewardship.reconstruct(snapshot)).toEqual({
        target: place,
        status: "stewarded",
        stewards: [{ accountId: A.accountId, since: T0 }],
        invitations: [{ id: inv(1), email: C.email, invitedAt: T1 }],
        version: 3,
      });
    });

    it.each([
      ["a status that disagrees with the stewards", { status: "vacant" }],
      ["a stewarded status without stewards", { stewards: [] }],
      ["an unknown kind", { target: { kind: "listing", id: place.id } }],
      [
        "duplicate stewards",
        {
          stewards: [
            { accountId: A.accountId, since: T0 },
            { accountId: A.accountId, since: T1 },
          ],
        },
      ],
      [
        "duplicate invitation emails",
        {
          invitations: [
            { id: inv(1), email: C.email, invitedAt: T1 },
            { id: inv(2), email: C.email, invitedAt: T1 },
          ],
        },
      ],
      [
        "an unnormalized email",
        {
          invitations: [
            { id: inv(1), email: "User3@Example.com", invitedAt: T1 },
          ],
        },
      ],
      ["a negative version", { version: -1 }],
    ])("refuses %s", (_label, patch) => {
      let error: unknown;
      try {
        Stewardship.reconstruct({ ...snapshot, ...patch });
      } catch (thrown) {
        error = thrown;
      }
      expect(isRehydrationError(error)).toBe(true);
    });
  });
});
