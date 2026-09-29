import { OccasionId } from "@repo/core/domain/common/ids";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_CONTENT_LOOKUPS,
  describeContentDirectoryContract,
  describeContentLookupMechanism,
  seedConformanceContent,
} from "../__conformance__/contentDirectory";
import { insertOccasions } from "../__conformance__/occasionFixtures";
import {
  insertRegions,
  publishedRegion,
  regionIds,
} from "../__conformance__/regionFixtures";
import { DoContentDirectory } from "../contentDirectory";
import type { LuntStateClient } from "../protocol/client";
import type { QueryArgs, QueryName, QueryResult } from "../protocol/queries";
import { CONTENT_LOOKUPS, describeContent } from "../store/contentLookups";
import { occasionContentLookup } from "../store/occasion";
import { regionContentLookup } from "../store/region";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the directory adapter over the object's store code on
// `node:sqlite`, with listings and places stored through their real
// repositories. The same suites run against the real object in the
// Workers pool.
describeContentDirectoryContract(async () => {
  const h = createNodeHarness();
  return { ...h, directory: new DoContentDirectory(h.state.client) };
});

const DESCRIBE = "moderation.describeContent";

function isDescribe(
  name: QueryName,
  _args: unknown,
): _args is QueryArgs<typeof DESCRIBE> {
  return name === DESCRIBE;
}

describeContentLookupMechanism(async () => {
  const { state } = createNodeHarness();
  const { sql } = state.storage;
  const client: Pick<LuntStateClient, "query"> = {
    query: async <K extends QueryName>(
      name: K,
      args: QueryArgs<K>,
    ): Promise<QueryResult<K>> => {
      if (!isDescribe(name, args)) return state.client.query(name, args);
      const records = structuredClone(
        describeContent(sql, args.targets, CONFORMANCE_CONTENT_LOOKUPS),
      );
      return records as QueryResult<typeof DESCRIBE> as QueryResult<K>;
    },
  };
  return {
    directory: new DoContentDirectory(client),
    seed: async (targets) => seedConformanceContent(sql, targets),
  };
});

describe("ContentDirectory in stage 3", () => {
  it("registers the region lookup and describes a stored region through the object's own lookups", async () => {
    expect(CONTENT_LOOKUPS.listing).toBeDefined();
    expect(CONTENT_LOOKUPS.place).toBeDefined();
    expect(CONTENT_LOOKUPS.region).toBe(regionContentLookup);
    expect(CONTENT_LOOKUPS.article).toBeUndefined();
    const h = createNodeHarness();
    const ids = regionIds();
    const photo = ids.photo();
    const R1 = publishedRegion(ids.region(), [photo]);
    await insertRegions(h, R1);
    const directory = new DoContentDirectory(h.state.client);
    expect(
      await directory.describe([
        { kind: "region", id: ids.region() },
        { kind: "region", id: R1.id },
      ]),
    ).toEqual([
      {
        target: { kind: "region", id: R1.id },
        name: "谷中",
        photoIds: [photo],
      },
    ]);
  });

  it("registers the occasion lookup and describes a stored occasion through the object's own lookups", async () => {
    expect(CONTENT_LOOKUPS.occasion).toBe(occasionContentLookup);
    const h = createNodeHarness();
    const f = occasionFactory();
    const O1 = f.published({ name: "夏祭り", photos: 2 });
    await insertOccasions(h, O1);
    const directory = new DoContentDirectory(h.state.client);
    expect(
      await directory.describe([
        { kind: "occasion", id: OccasionId.create(f.nextId()) },
        { kind: "occasion", id: O1.id },
      ]),
    ).toEqual([
      {
        target: { kind: "occasion", id: O1.id },
        name: "夏祭り",
        photoIds: O1.content.photos.items.map((photo) => photo.photoId),
      },
    ]);
  });
});
