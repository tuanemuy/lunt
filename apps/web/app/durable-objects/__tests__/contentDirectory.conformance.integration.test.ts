import { env, runInDurableObject } from "cloudflare:test";
import {
  CONFORMANCE_CONTENT_LOOKUPS,
  describeContentDirectoryContract,
  describeContentLookupMechanism,
  seedConformanceContent,
} from "@repo/core/adapters/durableObject/__conformance__/contentDirectory";
import { insertOccasions } from "@repo/core/adapters/durableObject/__conformance__/occasionFixtures";
import {
  insertRegions,
  publishedRegion,
  regionIds,
} from "@repo/core/adapters/durableObject/__conformance__/regionFixtures";
import { DoContentDirectory } from "@repo/core/adapters/durableObject/contentDirectory";
import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import type {
  QueryArgs,
  QueryName,
  QueryResult,
} from "@repo/core/adapters/durableObject/protocol/queries";
import type { SqlExec } from "@repo/core/adapters/durableObject/sql";
import { describeContent } from "@repo/core/adapters/durableObject/store/contentLookups";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/durableObject/unitOfWork";
import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
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

// The real object: listings, places and regions stored through their repositories,
// the directory reading the object's own lookups.
describeContentDirectoryContract(async () => {
  const stub = freshStub();
  const client = stub as unknown as LuntStateClient;
  return {
    uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
    savedEvents: () =>
      runInDurableObject(stub, (_instance, state) =>
        state.storage.sql
          .exec<{ event_type: string; aggregate_id: string; payload: string }>(
            "SELECT event_type, aggregate_id, payload FROM outbox_events ORDER BY created_at, id",
          )
          .toArray()
          .map((row) => ({
            type: row.event_type,
            aggregateId: row.aggregate_id,
            payload: JSON.parse(row.payload) as unknown,
          })),
      ),
    directory: new DoContentDirectory(client),
  };
});

// The real object's SQLite with the conformance-only lookups standing in
// for the content kinds that have no storage yet.
describeContentLookupMechanism(async () => {
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

describe("ContentDirectory in stage 3 (real object)", () => {
  it("describes a stored region through the object's own lookups; an absent one reads as absent", async () => {
    const client = freshStub() as unknown as LuntStateClient;
    const ids = regionIds();
    const photo = ids.photo();
    const R1 = publishedRegion(ids.region(), [photo]);
    await insertRegions(
      { uow: new DoUnitOfWorkProvider(client, UuidV7Generator) },
      R1,
    );
    expect(
      await new DoContentDirectory(client).describe([
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

  it("describes a stored occasion through the object's own lookups", async () => {
    const client = freshStub() as unknown as LuntStateClient;
    const f = occasionFactory();
    const O1 = f.unpublished({ name: "夏祭り" });
    await insertOccasions(
      {
        uow: new DoUnitOfWorkProvider(client, UuidV7Generator),
        savedEvents: async () => [],
      },
      O1,
    );
    expect(
      await new DoContentDirectory(client).describe([
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
