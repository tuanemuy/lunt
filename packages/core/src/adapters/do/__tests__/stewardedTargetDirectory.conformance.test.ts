import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_TARGET_LOOKUPS,
  describeStewardedTargetDirectoryContract,
  seedConformanceTargets,
} from "../__conformance__/stewardedTargetDirectory";
import type { LuntStateClient } from "../protocol/client";
import { DoStewardedTargetDirectory } from "../stewardedTargetDirectory";
import {
  describeStewardedTargets,
  STEWARDED_TARGET_LOOKUPS,
} from "../store/stewardedTargetLookups";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the directory adapter and the object's lookup mechanism on
// `node:sqlite`, with the conformance-only lookups standing in for the
// target kinds P1 does not have yet. The same suite runs against the real
// object in the Workers pool.
describeStewardedTargetDirectoryContract(async () => {
  const { state } = createNodeHarness();
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
    seed: async (targets) => seedConformanceTargets(sql, targets),
  };
});

describe("StewardedTargetDirectory in P1", () => {
  it("registers no target kind yet, so every target reads as absent", async () => {
    expect(STEWARDED_TARGET_LOOKUPS).toEqual({});
    const { state } = createNodeHarness();
    const directory = new DoStewardedTargetDirectory(state.client);
    expect(
      await directory.describe([
        {
          kind: "place",
          id: PlaceId.create("ffffffff-ffff-7fff-8fff-000000000001"),
        },
      ]),
    ).toEqual([]);
    expect(StewardedTargetOrder.kinds).toEqual(["place", "region", "occasion"]);
  });
});
