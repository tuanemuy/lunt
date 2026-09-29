import { OccasionId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { listApplicationsForSubject } from "../listApplicationsForSubject";
import { listMyApplications } from "../listMyApplications";
import { type ReviewKit, reviewKit } from "./reviewKit";

const PAGE = { page: 1, limit: 10 } as const;

const forSubject = (k: ReviewKit, who: Person, subject: StewardedRef) =>
  listApplicationsForSubject({
    container: k.container,
    actor: who.actor,
    input: { subject, pagination: PAGE },
  });

/** The steward of another place, region and occasion. */
async function outsider(k: ReviewKit): Promise<Person> {
  const who = await k.person("outsider");
  await k.appoint({ kind: "place", id: await k.place("別の店") }, who);
  await k.appoint(k.region("別の地域"), who);
  await k.appoint(k.occasion("別のイベント"), who);
  return who;
}

describe("a missing subject is reported before access (index.md 「エラーの種類」)", () => {
  const subjects: ReadonlyArray<
    readonly [
      string,
      (k: ReviewKit) => StewardedRef,
      (k: ReviewKit) => Promise<StewardedRef>,
    ]
  > = [
    [
      "place",
      (k) => ({ kind: "place", id: PlaceId.create(k.newId()) }),
      async (k) => ({ kind: "place", id: await k.place("P") }),
    ],
    [
      "region",
      (k) => ({ kind: "region", id: RegionId.create(k.newId()) }),
      async (k) => k.region("X"),
    ],
    [
      "occasion",
      (k) => ({ kind: "occasion", id: OccasionId.create(k.newId()) }),
      async (k) => k.occasion("E"),
    ],
  ];

  for (const [kind, missing, existing] of subjects) {
    it(`listApplicationsForSubject (${kind}): someone refused on any ${kind} gets NotFoundError for a missing one, ForbiddenError for an existing one`, async () => {
      const k = await reviewKit();
      const who = await outsider(k);
      await expectCode(
        forSubject(k, who, missing(k)),
        NotFoundError,
        `${kind.toUpperCase()}_NOT_FOUND`,
      );
      await expectCode(forSubject(k, who, await existing(k)), ForbiddenError);
    });
  }

  it("listMyApplications narrowed to a place: the steward of another place gets NotFoundError for a missing place, ForbiddenError for an existing one", async () => {
    const k = await reviewKit();
    const who = await outsider(k);
    const list = (placeId: PlaceId) =>
      listMyApplications({
        container: k.container,
        actor: who.actor,
        input: { placeId, pagination: PAGE },
      });
    await expectCode(
      list(PlaceId.create(k.newId())),
      NotFoundError,
      "PLACE_NOT_FOUND",
    );
    await expectCode(list(await k.place("P")), ForbiddenError);
  });
});
