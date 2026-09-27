import { env, runInDurableObject } from "cloudflare:test";
import {
  CONFORMANCE_CONTENT_LOOKUPS,
  describeContentDirectoryContract,
  seedConformanceContent,
} from "@repo/core/adapters/do/__conformance__/contentDirectory";
import { DoContentDirectory } from "@repo/core/adapters/do/contentDirectory";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import type {
  QueryArgs,
  QueryName,
  QueryResult,
} from "@repo/core/adapters/do/protocol/queries";
import type { SqlExec } from "@repo/core/adapters/do/sql";
import { describeContent } from "@repo/core/adapters/do/store/contentLookups";
import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";

const DESCRIBE = "moderation.describeContent";

const freshStub = () =>
  env.LUNT_STATE.get(
    env.LUNT_STATE.idFromName(`conformance-${crypto.randomUUID()}`),
  );

function isDescribe(
  name: QueryName,
  _args: unknown,
): _args is QueryArgs<typeof DESCRIBE> {
  return name === DESCRIBE;
}

// The real object's SQLite with the conformance-only lookups standing in
// for the content kinds stage 1 does not have yet: each describe runs the
// lookup mechanism inside the object.
describeContentDirectoryContract(async () => {
  const stub = freshStub();
  const client = stub as unknown as LuntStateClient;
  const inObject = <T>(fn: (sql: SqlExec) => T): Promise<T> =>
    runInDurableObject(stub, (_instance, state) =>
      fn(state.storage.sql as unknown as SqlExec),
    );
  const viaLookups: Pick<LuntStateClient, "query"> = {
    query: async <K extends QueryName>(
      name: K,
      args: QueryArgs<K>,
    ): Promise<QueryResult<K>> => {
      if (!isDescribe(name, args)) return client.query(name, args);
      const records = await inObject((sql) =>
        describeContent(sql, args.targets, CONFORMANCE_CONTENT_LOOKUPS),
      );
      return records as QueryResult<typeof DESCRIBE> as QueryResult<K>;
    },
  };
  return {
    directory: new DoContentDirectory(viaLookups),
    seed: (targets) => inObject((sql) => seedConformanceContent(sql, targets)),
  };
});

describe("ContentDirectory in stage 1 (real object)", () => {
  it("registers no content kind yet, so every target reads as absent", async () => {
    const directory = new DoContentDirectory(
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
