import { env, runInDurableObject } from "cloudflare:test";
import {
  CONFORMANCE_TARGET_LOOKUPS,
  describeStewardedTargetDirectoryContract,
  seedConformanceTargets,
} from "@repo/core/adapters/do/__conformance__/stewardedTargetDirectory";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import type { SqlExec } from "@repo/core/adapters/do/sql";
import { DoStewardedTargetDirectory } from "@repo/core/adapters/do/stewardedTargetDirectory";
import { describeStewardedTargets } from "@repo/core/adapters/do/store/stewardedTargetLookups";
import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";

const freshStub = () =>
  env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );

// The real object's SQLite with the conformance-only lookups standing in
// for the target kinds P1 does not have yet: each describe runs the
// lookup mechanism inside the object.
describeStewardedTargetDirectoryContract(async () => {
  const stub = freshStub();
  const client = stub as unknown as LuntStateClient;
  const inObject = <T>(fn: (sql: SqlExec) => T): Promise<T> =>
    runInDurableObject(stub, (_instance, state) =>
      fn(state.storage.sql as unknown as SqlExec),
    );
  const viaLookups: Pick<LuntStateClient, "query"> = {
    query: async (name, args) => {
      if (name !== "authority.describeTargets") {
        return client.query(name, args);
      }
      const { targets } = args as {
        targets: readonly { kind: string; id: string }[];
      };
      return (await inObject((sql) =>
        describeStewardedTargets(sql, targets, CONFORMANCE_TARGET_LOOKUPS),
      )) as never;
    },
  };
  return {
    directory: new DoStewardedTargetDirectory(viaLookups),
    seed: (targets) => inObject((sql) => seedConformanceTargets(sql, targets)),
  };
});

describe("StewardedTargetDirectory in P1 (real object)", () => {
  it("registers no target kind yet, so every target reads as absent", async () => {
    const directory = new DoStewardedTargetDirectory(
      freshStub() as unknown as LuntStateClient,
    );
    expect(
      await directory.describe([
        {
          kind: "place",
          id: PlaceId.create("ffffffff-ffff-7fff-8fff-000000000001"),
        },
      ]),
    ).toEqual([]);
  });
});
