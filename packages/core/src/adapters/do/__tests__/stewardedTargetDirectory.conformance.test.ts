import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { authorityIds } from "../__conformance__/authorityFixtures";
import { insertPlaces, newPlace } from "../__conformance__/placeFixtures";
import {
  CONFORMANCE_TARGET_LOOKUPS,
  describeStewardedTargetDirectoryContract,
  seedConformanceTargets,
} from "../__conformance__/stewardedTargetDirectory";
import type { LuntStateClient } from "../protocol/client";
import { DoStewardedTargetDirectory } from "../stewardedTargetDirectory";
import { placeStewardedTargetLookup } from "../store/place";
import {
  describeStewardedTargets,
  STEWARDED_TARGET_LOOKUPS,
} from "../store/stewardedTargetLookups";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the directory adapter and the object's lookup mechanism on
// `node:sqlite` — places through Place's real repository and lookup,
// regions and occasions through the conformance-only lookups until S3A.
// The same suite runs against the real object in the Workers pool.
describeStewardedTargetDirectoryContract(async () => {
  const { state, uow } = createNodeHarness();
  const { sql } = state.storage;
  const client: Pick<LuntStateClient, "query"> = {
    query: async (name, args) => {
      if (name !== "authority.describeTargets") {
        return state.client.query(name, args);
      }
      const { targets } = args as {
        targets: readonly { kind: string; id: string }[];
      };
      return structuredClone(
        describeStewardedTargets(sql, targets, CONFORMANCE_TARGET_LOOKUPS),
      ) as never;
    },
  };
  return {
    directory: new DoStewardedTargetDirectory(client),
    uow,
    seed: async (targets) => seedConformanceTargets(sql, targets),
  };
});

describe("StewardedTargetDirectory in stage 2", () => {
  it("registers the place lookup; regions and occasions read as absent", async () => {
    expect(STEWARDED_TARGET_LOOKUPS.place).toBe(placeStewardedTargetLookup);
    expect(STEWARDED_TARGET_LOOKUPS.region).toBeUndefined();
    expect(STEWARDED_TARGET_LOOKUPS.occasion).toBeUndefined();

    const h = createNodeHarness();
    const ids = authorityIds();
    const P1 = ids.place();
    await insertPlaces(h, newPlace(P1.id, { name: "喫茶ルント" }));
    const directory = new DoStewardedTargetDirectory(h.state.client);
    expect(
      await directory.describe([
        { kind: "region", id: RegionId.create(ids.region().id) },
        { kind: "occasion", id: OccasionId.create(ids.occasion().id) },
        P1,
      ]),
    ).toEqual([{ target: P1, name: "喫茶ルント" }]);
    expect(StewardedTargetOrder.kinds).toEqual(["place", "region", "occasion"]);
  });
});
