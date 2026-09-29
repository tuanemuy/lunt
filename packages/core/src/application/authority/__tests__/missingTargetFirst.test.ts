import { InvitationId, PlaceId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, it } from "vitest";
import { ForbiddenError, NotFoundError } from "../../errors";
import { cancelInvitation } from "../cancelInvitation";
import { inviteMember } from "../inviteMember";
import { resignStewardship } from "../resignStewardship";
import { revokeSteward } from "../revokeSteward";
import { viewMembers } from "../viewMembers";
import { authorityKit, expectCode, type Kit, type Person } from "./kit";

type Call = (k: Kit, who: Person, target: StewardedRef) => Promise<unknown>;

const calls: ReadonlyArray<readonly [string, Call]> = [
  [
    "viewMembers",
    (k, who, target) =>
      viewMembers({
        container: k.container,
        actor: who.actor,
        input: { target },
      }),
  ],
  [
    "inviteMember",
    (k, who, target) =>
      inviteMember({
        container: k.container,
        actor: who.actor,
        input: {
          target,
          invitationId: k.invitationId(),
          email: k.unregisteredEmail(),
        },
      }),
  ],
  [
    "cancelInvitation",
    (k, who, target) =>
      cancelInvitation({
        container: k.container,
        actor: who.actor,
        input: { target, invitationId: InvitationId.create(k.invitationId()) },
      }),
  ],
  [
    "resignStewardship",
    (k, who, target) =>
      resignStewardship({
        container: k.container,
        actor: who.actor,
        input: { target },
      }),
  ],
  [
    "revokeSteward",
    async (k, who, target) =>
      revokeSteward({
        container: k.container,
        actor: who.actor,
        input: { target, accountId: (await k.person()).accountId },
      }),
  ],
];

describe("a missing target is reported before access (index.md 「エラーの種類」)", () => {
  for (const [name, call] of calls) {
    it(`${name}: the steward of another place gets NotFoundError for a missing target, ForbiddenError for an existing one`, async () => {
      const k = authorityKit();
      const who = await k.person("outsider");
      await k.appoint(k.place("別の店"), who);
      const missing: StewardedRef = {
        kind: "place",
        id: PlaceId.create(k.invitationId()),
      };
      await expectCode(call(k, who, missing), NotFoundError, "PLACE_NOT_FOUND");
      const existing = k.place("P");
      await k.appoint(existing, await k.person("steward"));
      await expectCode(call(k, who, existing), ForbiddenError);
    });
  }
});
