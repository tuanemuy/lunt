import { env, runInDurableObject } from "cloudflare:test";
import { authorityIds } from "@repo/core/adapters/do/__conformance__/authorityFixtures";
import {
  insertPlaces,
  newPlace,
} from "@repo/core/adapters/do/__conformance__/placeFixtures";
import {
  CONFORMANCE_TARGET_LOOKUPS,
  describeStewardedTargetDirectoryContract,
  seedConformanceTargets,
} from "@repo/core/adapters/do/__conformance__/stewardedTargetDirectory";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import type { SqlExec } from "@repo/core/adapters/do/sql";
import { DoStewardedTargetDirectory } from "@repo/core/adapters/do/stewardedTargetDirectory";
import { describeStewardedTargets } from "@repo/core/adapters/do/store/stewardedTargetLookups";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { describe, expect, it } from "vitest";

const freshStub = () =>
  env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );

// The real object's SQLite: places stored through Place's repository and
// read by its lookup, regions and occasions through the conformance-only
// lookups until S3A. Each describe runs the lookup mechanism inside the
// object.
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
    uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
    seed: (targets) => inObject((sql) => seedConformanceTargets(sql, targets)),
  };
});

describe("StewardedTargetDirectory in stage 2 (real object)", () => {
  it("describes a stored place through the object's own lookups", async () => {
    const client = freshStub() as unknown as LuntStateClient;
    const P1 = authorityIds().place();
    await insertPlaces(
      {
        uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
        savedEvents: async () => [],
      },
      newPlace(P1.id, { name: "喫茶ルント" }),
    );
    expect(await new DoStewardedTargetDirectory(client).describe([P1])).toEqual(
      [{ target: P1, name: "喫茶ルント" }],
    );
  });
});
