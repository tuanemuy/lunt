import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_CONTENT_LOOKUPS,
  describeContentDirectoryContract,
  seedConformanceContent,
} from "../__conformance__/contentDirectory";
import { DoContentDirectory } from "../contentDirectory";
import type { LuntStateClient } from "../protocol/client";
import type { QueryArgs, QueryName, QueryResult } from "../protocol/queries";
import { CONTENT_LOOKUPS, describeContent } from "../store/contentLookups";
import { createNodeHarness } from "../testing/nodeHarness";

const DESCRIBE = "moderation.describeContent";

function isDescribe(
  name: QueryName,
  _args: unknown,
): _args is QueryArgs<typeof DESCRIBE> {
  return name === DESCRIBE;
}

// Node backend: the directory adapter and the object's lookup mechanism on
// `node:sqlite`, with the conformance-only lookups standing in for the
// content kinds stage 1 does not have yet. The same suite runs against the
// real object in the Workers pool.
describeContentDirectoryContract(async () => {
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

describe("ContentDirectory in stage 1", () => {
  it("registers no content kind yet, so every target reads as absent", async () => {
    expect(CONTENT_LOOKUPS).toEqual({});
    const { state } = createNodeHarness();
    const directory = new DoContentDirectory(state.client);
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
