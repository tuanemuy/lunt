import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { chooseRepresentativeRegion } from "../chooseRepresentativeRegion";
import { excludeAffiliatedPlace } from "../excludeAffiliatedPlace";
import { getManagedRegion } from "../getManagedRegion";
import { getPlaceAffiliationStatus } from "../getPlaceAffiliationStatus";
import { listAffiliatedPlaces } from "../listAffiliatedPlaces";
import { publishRegion } from "../publishRegion";
import { suspendRegion } from "../suspendRegion";
import { unpublishRegion } from "../unpublishRegion";
import { unsuspendRegion } from "../unsuspendRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

type RegionCall = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
) => Promise<unknown>;
type PlaceCall = (
  k: RegionKit,
  who: Person,
  placeId: PlaceId,
) => Promise<unknown>;

const byRegion: ReadonlyArray<readonly [string, RegionCall]> = [
  [
    "getManagedRegion",
    (k, who, regionId) =>
      getManagedRegion({
        container: k.container,
        actor: who.actor,
        input: { regionId },
      }),
  ],
  [
    "updateRegionContent",
    (k, who, regionId) =>
      updateRegionContent({
        container: k.container,
        actor: who.actor,
        input: {
          regionId,
          version: Version.initial(),
          content: contentFields(),
        },
      }),
  ],
  [
    "publishRegion",
    (k, who, regionId) =>
      publishRegion({
        container: k.container,
        actor: who.actor,
        input: { regionId },
      }),
  ],
  [
    "unpublishRegion",
    (k, who, regionId) =>
      unpublishRegion({
        container: k.container,
        actor: who.actor,
        input: { regionId },
      }),
  ],
  [
    "suspendRegion",
    (k, who, regionId) =>
      suspendRegion({
        container: k.container,
        actor: who.actor,
        input: { regionId },
      }),
  ],
  [
    "unsuspendRegion",
    (k, who, regionId) =>
      unsuspendRegion({
        container: k.container,
        actor: who.actor,
        input: { regionId },
      }),
  ],
  [
    "listAffiliatedPlaces",
    (k, who, regionId) =>
      listAffiliatedPlaces({
        container: k.container,
        actor: who.actor,
        input: { regionId, pagination: { page: 1, limit: 10 } },
      }),
  ],
  [
    "excludeAffiliatedPlace",
    async (k, who, regionId) =>
      excludeAffiliatedPlace({
        container: k.container,
        actor: who.actor,
        input: { regionId, placeId: (await k.place()).id },
      }),
  ],
];

const byPlace: ReadonlyArray<readonly [string, PlaceCall]> = [
  [
    "getPlaceAffiliationStatus",
    (k, who, placeId) =>
      getPlaceAffiliationStatus({
        container: k.container,
        actor: who.actor,
        input: { placeId },
      }),
  ],
  [
    "chooseRepresentativeRegion",
    (k, who, placeId) =>
      chooseRepresentativeRegion({
        container: k.container,
        actor: who.actor,
        input: { placeId, regionId: k.absentRegionId() },
      }),
  ],
];

/** The steward of another region: no authority over the one asked for. */
async function outsider(k: RegionKit): Promise<Person> {
  const other = await k.region({ name: "別の地域" }, "published");
  return k.steward(other.id, "outsider");
}

describe("a missing target is reported before access (index.md 「エラーの種類」)", () => {
  for (const [name, call] of byRegion) {
    it(`${name}: someone refused on any region gets NotFoundError for a missing one, ForbiddenError for an existing one`, async () => {
      const k = regionKit();
      const who = await outsider(k);
      await expectCode(
        call(k, who, k.absentRegionId()),
        NotFoundError,
        "REGION_NOT_FOUND",
      );
      const existing = await k.region({ name: "X" }, "published");
      await expectCode(call(k, who, existing.id), ForbiddenError);
    });
  }

  for (const [name, call] of byPlace) {
    it(`${name}: someone refused on any place gets NotFoundError for a missing one, ForbiddenError for an existing one`, async () => {
      const k = regionKit();
      const who = await outsider(k);
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
