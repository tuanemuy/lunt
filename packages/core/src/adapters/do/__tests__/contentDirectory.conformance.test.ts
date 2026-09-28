import { RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_CONTENT_LOOKUPS,
  describeContentDirectoryContract,
  describeContentLookupMechanism,
  seedConformanceContent,
} from "../__conformance__/contentDirectory";
import { DoContentDirectory } from "../contentDirectory";
import type { LuntStateClient } from "../protocol/client";
import type { QueryArgs, QueryName, QueryResult } from "../protocol/queries";
import { CONTENT_LOOKUPS, describeContent } from "../store/contentLookups";
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

const STAGE_2_KINDS = ["listing", "place"];

describe("ContentDirectory in stage 2", () => {
  it("registers only the kinds whose tables exist, so a region still reads as absent", async () => {
    expect(Object.keys(CONTENT_LOOKUPS).sort()).toEqual(STAGE_2_KINDS);
    const { state } = createNodeHarness();
    const directory = new DoContentDirectory(state.client);
    expect(
      await directory.describe([
        {
          kind: "region",
          id: RegionId.create("ffffffff-ffff-7fff-8fff-000000000001"),
        },
      ]),
    ).toEqual([]);
  });
});
