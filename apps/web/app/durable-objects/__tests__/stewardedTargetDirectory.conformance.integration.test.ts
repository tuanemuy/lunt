import { env } from "cloudflare:test";
import { authorityIds } from "@repo/core/adapters/durableObject/__conformance__/authorityFixtures";
import { insertOccasions } from "@repo/core/adapters/durableObject/__conformance__/occasionFixtures";
import {
  insertPlaces,
  newPlace,
} from "@repo/core/adapters/durableObject/__conformance__/placeFixtures";
import {
  insertRegions,
  newRegion,
  regionContent,
} from "@repo/core/adapters/durableObject/__conformance__/regionFixtures";
import { describeStewardedTargetDirectoryContract } from "@repo/core/adapters/durableObject/__conformance__/stewardedTargetDirectory";
import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import { DoStewardedTargetDirectory } from "@repo/core/adapters/durableObject/stewardedTargetDirectory";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/durableObject/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { describe, expect, it } from "vitest";

const freshStub = () =>
  env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );

// The real object's SQLite: places, regions and occasions stored through
// their repositories and read by the object's own lookups.
describeStewardedTargetDirectoryContract(async () => {
  const client = freshStub() as unknown as LuntStateClient;
  return {
    directory: new DoStewardedTargetDirectory(client),
    uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
  };
});

describe("StewardedTargetDirectory in stage 3 (real object)", () => {
  it("describes a stored place, region and occasion through the object's own lookups", async () => {
    const client = freshStub() as unknown as LuntStateClient;
    const ids = authorityIds();
    const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
    const f = occasionFactory();
    const h = {
      uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
      savedEvents: async () => [],
    };
    await insertPlaces(h, newPlace(P1.id, { name: "喫茶ルント" }));
    await insertRegions(h, newRegion(R1.id, regionContent({ name: "谷中" })));
    await insertOccasions(h, f.draft({ name: "夏祭り" }, f.tick(), O1.id));
    expect(
      await new DoStewardedTargetDirectory(client).describe([O1, R1, P1]),
    ).toEqual([
      { target: P1, name: "喫茶ルント" },
      { target: R1, name: "谷中" },
      { target: O1, name: "夏祭り" },
    ]);
  });
});
