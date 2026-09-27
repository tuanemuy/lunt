import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import {
  type PlaceRef,
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { Addressing, type AddressingFacts } from "../addressing";
import type { Announcement } from "../announcement";
import { notificationIds } from "./samples";

const ids = notificationIds();
const now = new Date("2026-09-28T00:00:00.000Z");
const origin = { by: "content", token: "t" } as const;

const person = (accountId: AccountId, n: number) => ({
  accountId,
  email: EmailAddress.create(`p${n}@example.com`),
});

const [O1, O2, E1, S1, S2, S3, U] = Array.from({ length: 7 }, () =>
  ids.account(),
) as [
  AccountId,
  AccountId,
  AccountId,
  AccountId,
  AccountId,
  AccountId,
  AccountId,
];

function operators(...who: readonly AccountId[]) {
  let roster = RoleRoster.initial("operator");
  const [first, ...rest] = who;
  if (first === undefined) return roster;
  let r: RoleRoster = RoleRoster.establishOperators(roster, first, now).entity;
  for (const id of rest) r = RoleRoster.grant(r, id, now).entity;
  roster = r as typeof roster;
  return roster;
}

function stewardsOf(target: PlaceRef, ...who: readonly AccountId[]) {
  let s: StewardshipOf<PlaceRef> = Stewardship.vacant(target);
  who.forEach((id, n) => {
    s = Stewardship.appointByApproval(s, person(id, n), now).entity;
  });
  return s;
}

const facts = (over: Partial<AddressingFacts> = {}): AddressingFacts => ({
  stewardship: null,
  operators: operators(O1, O2),
  editors: RoleRoster.grant(RoleRoster.initial("editor"), E1, now)
    .entity as AddressingFacts["editors"],
  inviteeAccount: null,
  ...over,
});

describe("Addressing.resolve", () => {
  const P: PlaceRef = { kind: "place", id: ids.place() };
  const stewardAdded: Announcement = {
    occurrence: {
      to: "placeStewards",
      placeId: P.id,
      subject: {
        kind: "place",
        matter: { kind: "steward_added", appointee: S3 },
      },
    },
    origin,
  };

  it("addresses the stewards but the appointee, directly", () => {
    const resolved = Addressing.resolve(
      stewardAdded,
      facts({ stewardship: stewardsOf(P, S1, S2, S3) }),
    );
    expect(resolved.delivered.delivery).toBe("direct");
    expect(resolved.to).toEqual({ kind: "accounts", accountIds: [S1, S2] });
  });

  it("addresses nobody when the appointee is the only steward", () => {
    const resolved = Addressing.resolve(
      stewardAdded,
      facts({ stewardship: stewardsOf(P, S3) }),
    );
    expect(resolved.to).toEqual({ kind: "accounts", accountIds: [] });
    expect(resolved.delivered.delivery).toBe("direct");
  });

  it("stands the operators in for a vacant target, and nobody before the opening", () => {
    const proxied = Addressing.resolve(stewardAdded, facts());
    expect(proxied.delivered.delivery).toBe("proxy");
    expect(proxied.to).toEqual({ kind: "accounts", accountIds: [O1, O2] });
    const unopened = Addressing.resolve(
      stewardAdded,
      facts({ operators: RoleRoster.initial("operator") }),
    );
    expect(unopened.to).toEqual({ kind: "accounts", accountIds: [] });
  });

  it("addresses the named account, the role holders, or the invitee", () => {
    expect(
      Addressing.resolve(
        {
          occurrence: {
            to: "grantee",
            granted: { kind: "role", role: "editor" },
          },
          accountId: U,
          origin,
        },
        facts(),
      ).to,
    ).toEqual({ kind: "accounts", accountIds: [U] });
    expect(
      Addressing.resolve(
        {
          occurrence: {
            to: "approver",
            approver: { kind: "operator" },
            applicationId: ids.application(),
            matter: "submitted",
          },
          origin,
        },
        facts(),
      ).to,
    ).toEqual({ kind: "accounts", accountIds: [O1, O2] });
    const invitation: Announcement = {
      occurrence: {
        to: "invitee",
        email: EmailAddress.create("new@example.com"),
        target: P,
        invitationId: ids.invitation(),
      },
      origin,
    };
    expect(Addressing.resolve(invitation, facts()).to).toEqual({
      kind: "emailOnly",
      email: "new@example.com",
    });
    expect(
      Addressing.resolve(invitation, facts({ inviteeAccount: U })).to,
    ).toEqual({ kind: "accounts", accountIds: [U] });
  });

  it("derives the audience of each announcement", () => {
    expect(Addressing.audienceOf(stewardAdded)).toEqual({
      kind: "stewards",
      target: P,
      except: S3,
    });
    expect(
      Addressing.audienceOf({
        occurrence: {
          to: "contentManagers",
          content: { kind: "article", id: ids.article() },
          matter: { kind: "photos_taken_down" },
        },
        origin,
      }),
    ).toEqual({ kind: "role", role: "editor" });
  });
});
