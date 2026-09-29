import {
  type OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { addParticipationDirectly } from "../addParticipationDirectly";
import { cancelOccasion } from "../cancelOccasion";
import { changeParticipationByOccasion } from "../changeParticipationByOccasion";
import { changeParticipationByPlace } from "../changeParticipationByPlace";
import { detachRegionLink } from "../detachRegionLink";
import { excludeParticipant } from "../excludeParticipant";
import { getManagedOccasion } from "../getManagedOccasion";
import { getParticipationDetails } from "../getParticipationDetails";
import { getPlaceParticipations } from "../getPlaceParticipations";
import { linkRegion } from "../linkRegion";
import { listAttachableListings } from "../listAttachableListings";
import { listOccasionParticipants } from "../listOccasionParticipants";
import { listOccasionRegionLinks } from "../listOccasionRegionLinks";
import { listRegionOccasionLinks } from "../listRegionOccasionLinks";
import { publishOccasion } from "../publishOccasion";
import { restoreRegionLink } from "../restoreRegionLink";
import { revokeOccasionCancellation } from "../revokeOccasionCancellation";
import { suspendOccasion } from "../suspendOccasion";
import { unlinkRegion } from "../unlinkRegion";
import { unpublishOccasion } from "../unpublishOccasion";
import { unsuspendOccasion } from "../unsuspendOccasion";
import { updateOccasionContent } from "../updateOccasionContent";
import { withdrawParticipation } from "../withdrawParticipation";
import { fields, occasionKit } from "./kit";

type Kit = Awaited<ReturnType<typeof occasionKit>>;
type Args<I> = Readonly<{
  container: Kit["container"];
  actor: Person["actor"];
  input: I;
}>;
type Usecase<I> = (args: Args<I>) => Promise<unknown>;

const PAGE = { page: 1, limit: 10 } as const;
const NO_DETAILS = { listingIds: [], dates: [] } as const;

/**
 * The occasion operator of another occasion, who also stewards another
 * place and region: refused on everything the tests below ask about.
 */
async function outsider(k: Kit): Promise<Person> {
  const operator = await k.operator("setup");
  const who = await k.person("outsider");
  const otherOccasion = await k.register(operator, { name: "別のイベント" });
  await k.appoint(k.ref(otherOccasion.id), who);
  await k.appoint({ kind: "place", id: await k.place("別の店") }, who);
  await k.appoint(k.region("別の地域"), who);
  return who;
}

async function occasion(k: Kit): Promise<OccasionId> {
  const operator = await k.operator();
  return (await k.register(operator)).id;
}

const call = <I>(k: Kit, who: Person, usecase: Usecase<I>, input: I) =>
  usecase({ container: k.container, actor: who.actor, input });

describe("a missing target is reported before access (index.md 「エラーの種類」)", () => {
  const byOccasion: ReadonlyArray<
    readonly [
      string,
      (k: Kit, who: Person, occasionId: OccasionId) => Promise<unknown>,
    ]
  > = [
    [
      "getManagedOccasion",
      (k, who, occasionId) => call(k, who, getManagedOccasion, { occasionId }),
    ],
    [
      "updateOccasionContent",
      (k, who, occasionId) =>
        call(k, who, updateOccasionContent, {
          occasionId,
          version: Version.initial(),
          content: fields({ photoIds: [] }),
        }),
    ],
    [
      "publishOccasion",
      (k, who, occasionId) => call(k, who, publishOccasion, { occasionId }),
    ],
    [
      "unpublishOccasion",
      (k, who, occasionId) => call(k, who, unpublishOccasion, { occasionId }),
    ],
    [
      "cancelOccasion",
      (k, who, occasionId) => call(k, who, cancelOccasion, { occasionId }),
    ],
    [
      "revokeOccasionCancellation",
      (k, who, occasionId) =>
        call(k, who, revokeOccasionCancellation, { occasionId }),
    ],
    [
      "suspendOccasion",
      (k, who, occasionId) => call(k, who, suspendOccasion, { occasionId }),
    ],
    [
      "unsuspendOccasion",
      (k, who, occasionId) => call(k, who, unsuspendOccasion, { occasionId }),
    ],
    [
      "addParticipationDirectly",
      async (k, who, occasionId) =>
        call(k, who, addParticipationDirectly, {
          occasionId,
          placeId: await k.place(),
          ...NO_DETAILS,
        }),
    ],
    [
      "linkRegion",
      (k, who, occasionId) =>
        call(k, who, linkRegion, { occasionId, regionId: k.region().id }),
    ],
    [
      "listOccasionParticipants",
      (k, who, occasionId) =>
        call(k, who, listOccasionParticipants, {
          occasionId,
          pagination: PAGE,
        }),
    ],
    [
      "listOccasionRegionLinks",
      (k, who, occasionId) =>
        call(k, who, listOccasionRegionLinks, {
          occasionId,
          pagination: PAGE,
        }),
    ],
    [
      "getParticipationDetails",
      async (k, who, occasionId) =>
        call(k, who, getParticipationDetails, {
          occasionId,
          placeId: await k.place(),
        }),
    ],
    [
      "listAttachableListings",
      async (k, who, occasionId) =>
        call(k, who, listAttachableListings, {
          occasionId,
          placeId: await k.place(),
          pagination: PAGE,
        }),
    ],
  ];

  for (const [name, run] of byOccasion) {
    it(`${name}: someone refused on any occasion gets NotFoundError for a missing occasion, ForbiddenError for an existing one`, async () => {
      const k = await occasionKit();
      const who = await outsider(k);
      await expectCode(
        run(k, who, k.unknownOccasion()),
        NotFoundError,
        "OCCASION_NOT_FOUND",
      );
      await expectCode(run(k, who, await occasion(k)), ForbiddenError);
    });
  }

  const byPlace: ReadonlyArray<
    readonly [
      string,
      (
        k: Kit,
        who: Person,
        placeId: PlaceId,
        occasionId: OccasionId,
      ) => Promise<unknown>,
    ]
  > = [
    [
      "getPlaceParticipations",
      (k, who, placeId) =>
        call(k, who, getPlaceParticipations, { placeId, pagination: PAGE }),
    ],
    [
      "getParticipationDetails",
      (k, who, placeId, occasionId) =>
        call(k, who, getParticipationDetails, { occasionId, placeId }),
    ],
    [
      "listAttachableListings",
      (k, who, placeId, occasionId) =>
        call(k, who, listAttachableListings, {
          occasionId,
          placeId,
          pagination: PAGE,
        }),
    ],
  ];

  for (const [name, run] of byPlace) {
    it(`${name}: someone refused on any place gets NotFoundError for a missing place, ForbiddenError for an existing one`, async () => {
      const k = await occasionKit();
      const who = await outsider(k);
      const occasionId = await occasion(k);
      await expectCode(
        run(k, who, PlaceId.create(k.newId()), occasionId),
        NotFoundError,
        "PLACE_NOT_FOUND",
      );
      await expectCode(
        run(k, who, await k.place(), occasionId),
        ForbiddenError,
      );
    });
  }

  it("listRegionOccasionLinks: someone refused on any region gets NotFoundError for a missing region, ForbiddenError for an existing one", async () => {
    const k = await occasionKit();
    const who = await outsider(k);
    const list = (regionId: RegionId) =>
      call(k, who, listRegionOccasionLinks, { regionId, pagination: PAGE });
    await expectCode(
      list(RegionId.create(k.newId())),
      NotFoundError,
      "REGION_NOT_FOUND",
    );
    await expectCode(list(k.region().id), ForbiddenError);
  });

  const byParticipation: ReadonlyArray<
    readonly [
      string,
      (
        k: Kit,
        who: Person,
        occasionId: OccasionId,
        placeId: PlaceId,
      ) => Promise<unknown>,
    ]
  > = [
    [
      "changeParticipationByPlace",
      (k, who, occasionId, placeId) =>
        call(k, who, changeParticipationByPlace, {
          occasionId,
          placeId,
          version: Version.initial(),
          ...NO_DETAILS,
        }),
    ],
    [
      "withdrawParticipation",
      (k, who, occasionId, placeId) =>
        call(k, who, withdrawParticipation, { occasionId, placeId }),
    ],
    [
      "changeParticipationByOccasion",
      (k, who, occasionId, placeId) =>
        call(k, who, changeParticipationByOccasion, {
          occasionId,
          placeId,
          version: Version.initial(),
          ...NO_DETAILS,
        }),
    ],
    [
      "excludeParticipant",
      (k, who, occasionId, placeId) =>
        call(k, who, excludeParticipant, { occasionId, placeId }),
    ],
  ];

  for (const [name, run] of byParticipation) {
    it(`${name}: someone refused on the pair gets NotFoundError when the place does not take part, ForbiddenError when it does`, async () => {
      const k = await occasionKit();
      const who = await outsider(k);
      const occasionId = await occasion(k);
      const placeId = await k.place();
      await expectCode(
        run(k, who, occasionId, placeId),
        NotFoundError,
        "PARTICIPATION_NOT_FOUND",
      );
      await k.participate(occasionId, placeId);
      await expectCode(run(k, who, occasionId, placeId), ForbiddenError);
    });
  }

  const byLink: ReadonlyArray<
    readonly [
      string,
      (
        k: Kit,
        who: Person,
        occasionId: OccasionId,
        regionId: RegionId,
      ) => Promise<unknown>,
    ]
  > = [
    [
      "unlinkRegion",
      (k, who, occasionId, regionId) =>
        call(k, who, unlinkRegion, { occasionId, regionId }),
    ],
    [
      "detachRegionLink",
      (k, who, occasionId, regionId) =>
        call(k, who, detachRegionLink, { occasionId, regionId }),
    ],
    [
      "restoreRegionLink",
      (k, who, occasionId, regionId) =>
        call(k, who, restoreRegionLink, { occasionId, regionId }),
    ],
  ];

  for (const [name, run] of byLink) {
    it(`${name}: someone refused on the pair gets NotFoundError without a link, ForbiddenError with one`, async () => {
      const k = await occasionKit();
      const who = await outsider(k);
      const occasionId = await occasion(k);
      const regionId = k.region().id;
      await expectCode(
        run(k, who, occasionId, regionId),
        NotFoundError,
        "REGION_LINK_NOT_FOUND",
      );
      await k.link(occasionId, regionId);
      await expectCode(run(k, who, occasionId, regionId), ForbiddenError);
    });
  }
});
