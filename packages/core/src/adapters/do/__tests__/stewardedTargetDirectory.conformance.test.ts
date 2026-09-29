import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { RegionId } from "@repo/core/domain/common/ids";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { describe, expect, it } from "vitest";
import { authorityIds } from "../__conformance__/authorityFixtures";
import { insertOccasions } from "../__conformance__/occasionFixtures";
import { insertPlaces, newPlace } from "../__conformance__/placeFixtures";
import {
  insertRegions,
  newRegion,
  regionContent,
} from "../__conformance__/regionFixtures";
import { describeStewardedTargetDirectoryContract } from "../__conformance__/stewardedTargetDirectory";
import { DoStewardedTargetDirectory } from "../stewardedTargetDirectory";
import { occasionStewardedTargetLookup } from "../store/occasion";
import { placeStewardedTargetLookup } from "../store/place";
import { regionStewardedTargetLookup } from "../store/region";
import { STEWARDED_TARGET_LOOKUPS } from "../store/stewardedTargetLookups";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the directory adapter and the object's lookups on
// `node:sqlite` — places, regions and occasions through their real
// repositories. The same suite runs against the real object in the Workers
// pool.
describeStewardedTargetDirectoryContract(async () => {
  const { state, uow } = createNodeHarness();
  return { directory: new DoStewardedTargetDirectory(state.client), uow };
});

describe("StewardedTargetDirectory in stage 3", () => {
  it("registers the place, region and occasion lookups and describes stored ones through the object's own lookups", async () => {
    expect(STEWARDED_TARGET_LOOKUPS.place).toBe(placeStewardedTargetLookup);
    expect(STEWARDED_TARGET_LOOKUPS.region).toBe(regionStewardedTargetLookup);
    expect(STEWARDED_TARGET_LOOKUPS.occasion).toBe(
      occasionStewardedTargetLookup,
    );

    const h = createNodeHarness();
    const ids = authorityIds();
    const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
    const f = occasionFactory();
    await insertPlaces(h, newPlace(P1.id, { name: "喫茶ルント" }));
    await insertRegions(h, newRegion(R1.id, regionContent({ name: "谷中" })));
    await insertOccasions(h, f.draft({ name: "夏祭り" }, f.tick(), O1.id));
    const directory = new DoStewardedTargetDirectory(h.state.client);
    expect(
      await directory.describe([
        O1,
        R1,
        { kind: "region", id: RegionId.create(ids.region().id) },
        P1,
      ]),
    ).toEqual([
      { target: P1, name: "喫茶ルント" },
      { target: R1, name: "谷中" },
      { target: O1, name: "夏祭り" },
    ]);
    expect(StewardedTargetOrder.kinds).toEqual(["place", "region", "occasion"]);
  });
});
