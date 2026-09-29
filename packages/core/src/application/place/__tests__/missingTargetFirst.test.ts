import type { PlaceId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { changeOperatingStatus } from "../changeOperatingStatus";
import { getManagedPlace } from "../getManagedPlace";
import { suspendPlace } from "../suspendPlace";
import { unsuspendPlace } from "../unsuspendPlace";
import { updatePlaceProfile } from "../updatePlaceProfile";
import { type PlaceKit, placeKit, profileFields } from "./kit";

type Call = (k: PlaceKit, who: Person, placeId: PlaceId) => Promise<unknown>;

const calls: ReadonlyArray<readonly [string, Call]> = [
  [
    "getManagedPlace",
    (k, who, placeId) =>
      getManagedPlace({
        container: k.container,
        actor: who.actor,
        input: { placeId },
      }),
  ],
  [
    "updatePlaceProfile",
    (k, who, placeId) =>
      updatePlaceProfile({
        container: k.container,
        actor: who.actor,
        input: {
          placeId,
          version: Version.initial(),
          profile: profileFields(),
        },
      }),
  ],
  [
    "changeOperatingStatus",
    (k, who, placeId) =>
      changeOperatingStatus({
        container: k.container,
        actor: who.actor,
        input: {
          placeId,
          version: Version.initial(),
          status: "temporarilyClosed",
        },
      }),
  ],
  [
    "suspendPlace",
    (k, who, placeId) =>
      suspendPlace({
        container: k.container,
        actor: who.actor,
        input: { placeId },
      }),
  ],
  [
    "unsuspendPlace",
    (k, who, placeId) =>
      unsuspendPlace({
        container: k.container,
        actor: who.actor,
        input: { placeId },
      }),
  ],
];

describe("a missing place is reported before access (index.md 「エラーの種類」)", () => {
  for (const [name, call] of calls) {
    it(`${name}: the steward of another place gets NotFoundError for a missing place, ForbiddenError for an existing one`, async () => {
      const k = placeKit();
      const other = await k.place({ name: "別の店" });
      const who = await k.person("outsider");
      await k.appoint(k.placeRef(other), who);
      await expectCode(
        call(k, who, k.absentPlaceId()),
        NotFoundError,
        "PLACE_NOT_FOUND",
      );
      const existing = await k.place({ name: "P" });
      await expectCode(call(k, who, existing.id), ForbiddenError);
    });
  }
});
