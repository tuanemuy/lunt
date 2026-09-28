import { ForbiddenError, NotFoundError } from "@repo/core/application/errors";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { stewardIds } from "../../authority/__tests__/kit";
import { viewMembers } from "../../authority/viewMembers";
import { placeKit } from "../../place/__tests__/kit";
import { devAppointPlaceSteward } from "../devAppointPlaceSteward";

describe("devAppointPlaceSteward (development tool)", () => {
  it("makes an account a steward of a store without one, as claim approval would", async () => {
    const k = placeKit();
    const place = await k.place();
    const steward = await k.person("steward");
    const mark = await k.mark();

    await devAppointPlaceSteward({
      container: k.container,
      input: { placeId: place.id, email: steward.email },
    });

    expect(stewardIds(await k.stewardship(Place.ref(place)))).toEqual([
      steward.accountId,
    ]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_appointed",
        payload: {
          target: Place.ref(place),
          accountId: steward.accountId,
          via: "application",
        },
      }),
    ]);
    const members = await viewMembers({
      container: k.container,
      actor: steward.actor,
      input: { target: Place.ref(place) },
    });
    expect(members).toBeDefined();
  });

  it("refuses a missing store or account", async () => {
    const k = placeKit();
    const place = await k.place();
    await expect(
      devAppointPlaceSteward({
        container: k.container,
        input: { placeId: k.absentPlaceId(), email: "a@example.com" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      devAppointPlaceSteward({
        container: k.container,
        input: { placeId: place.id, email: "nobody@example.com" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is refused without the development tools", async () => {
    const k = placeKit();
    const place = await k.place();
    const steward = await k.person("steward");
    await expect(
      devAppointPlaceSteward({
        container: {
          ...k.container,
          runtime: { ...k.container.runtime, devTools: false },
        },
        input: { placeId: place.id, email: steward.email },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
