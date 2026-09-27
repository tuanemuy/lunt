import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import { describe, expect, it } from "vitest";
import { cancelInvitation } from "../cancelInvitation";
import { grantRole } from "../grantRole";
import { grantStewardship } from "../grantStewardship";
import { revokeRole } from "../revokeRole";
import { revokeSteward } from "../revokeSteward";
import {
  authorityKit,
  commitAfter,
  expectCode,
  invitationEmails,
  type Kit,
  type Person,
  stewardIds,
} from "./kit";

// spec/usecases/authority.md: grantRole, revokeRole and revokeSteward
// refuse with ForbiddenError when the operator's role is revoked 「確定までの
// 間に」 — after the unit of work read it, before it commits. The same
// guard covers grantStewardship and an absence proxy (AccessGuard).

/** O2 revokes O's operator role between O's reads and O's commit. */
const revokedMidway = (k: Kit, O: Person, O2: Person) =>
  commitAfter(k.container, () =>
    revokeRole({
      container: k.container,
      actor: O2.actor,
      input: { role: "operator", accountId: O.accountId },
    }),
  );

async function twoOperators(k: Kit) {
  const [O, O2] = [await k.person(), await k.person()];
  await k.operators(O, O2);
  return { O, O2 };
}

describe("AccessGuard: a role revoked before the commit", () => {
  it("refuses grantRole(editor) and grants nothing", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);
    const U = await k.person();

    await expectCode(
      grantRole({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { role: "editor", email: U.email },
      }),
      ForbiddenError,
    );

    expect(await k.holders("editor")).toEqual([]);
    expect(await k.holders("operator")).toEqual([O2.accountId]);
  });

  it("refuses revokeRole(editor) and keeps the editor", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);
    const E = await k.person();
    await k.editors(E);

    await expectCode(
      revokeRole({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { role: "editor", accountId: E.accountId },
      }),
      ForbiddenError,
    );

    expect(await k.holders("editor")).toEqual([E.accountId]);
  });

  it("refuses revokeSteward and keeps the steward", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);

    await expectCode(
      revokeSteward({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { target: P, accountId: A.accountId },
      }),
      ForbiddenError,
    );

    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
  });

  it("refuses grantStewardship and leaves the target vacant", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);
    const U = await k.person();
    const R = k.region();

    await expectCode(
      grantStewardship({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { target: R, email: U.email },
      }),
      ForbiddenError,
    );

    expect(stewardIds(await k.stewardship(R))).toEqual([]);
  });

  it("refuses an absence proxy's cancelInvitation and keeps the invitation", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);
    const C = await k.person();
    const P = k.place();
    const invitation = await k.invite(P, C.email);

    await expectCode(
      cancelInvitation({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { target: P, invitationId: invitation },
      }),
      ForbiddenError,
    );

    expect(invitationEmails(await k.stewardship(P))).toEqual([C.email]);
  });

  it("still lets an operator revoke their own role", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);

    await revokeRole({
      container: k.container,
      actor: O.actor,
      input: { role: "operator", accountId: O.accountId },
    });

    expect(await k.holders("operator")).toEqual([O2.accountId]);
  });

  it("reports a concurrent change of the same roster as a conflict, not a refusal", async () => {
    const k = authorityKit();
    const { O, O2 } = await twoOperators(k);

    // O2 removes O from the operator roster while O is removing O2 from
    // it: the roster's version decides (revokeRole#6).
    await expectCode(
      revokeRole({
        container: revokedMidway(k, O, O2),
        actor: O.actor,
        input: { role: "operator", accountId: O2.accountId },
      }),
      ConflictError,
    );
    expect(await k.holders("operator")).toEqual([O2.accountId]);
  });
});

describe("AccessGuard: an absent steward appointed before the commit", () => {
  it("refuses the absence proxy once the target has a steward", async () => {
    const k = authorityKit();
    const { O } = await twoOperators(k);
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    const invitation = await k.invite(P, C.email);

    // The appointment writes the same stewardship, so its version
    // decides first; either way the proxy's change is not kept.
    const error = await cancelInvitation({
      container: commitAfter(k.container, () => k.appoint(P, A)),
      actor: O.actor,
      input: { target: P, invitationId: invitation },
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(
      error instanceof ConflictError || error instanceof ForbiddenError,
    ).toBe(true);
    expect(invitationEmails(await k.stewardship(P))).toEqual([C.email]);
  });
});
