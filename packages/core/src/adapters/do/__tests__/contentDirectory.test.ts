import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "../__conformance__/assertions";
import { DoContentDirectory } from "../contentDirectory";
import { type ContentLookups, describeContent } from "../store/contentLookups";
import { createNodeHarness } from "../testing/nodeHarness";

const ids = new FakeIdGenerator(0x50_0000);
const place = (): ContentRef => ({
  kind: "place",
  id: PlaceId.create(ids.next()),
});
const listing = (): ContentRef => ({
  kind: "listing",
  id: ListingId.create(ids.next()),
});

describe("DoContentDirectory (stage 1: no content kind registered)", () => {
  it("reads every target as absent", async () => {
    const { state } = createNodeHarness();
    const directory = new DoContentDirectory(state.client);
    expect(await directory.describe([place(), listing()])).toEqual([]);
    expect(await directory.describe([])).toEqual([]);
  });

  it("refuses more than 100 targets", async () => {
    const { state } = createNodeHarness();
    const directory = new DoContentDirectory(state.client);
    await expectBusinessRuleError(
      directory.describe(Array.from({ length: 101 }, place)),
      CommonErrorCode.InvalidInput,
    );
  });
});

describe("describeContent over registered lookups", () => {
  it("asks each kind's lookup and orders listing, place, …, then id", () => {
    const [p1, p2, l1] = [place(), place(), listing()];
    const asked: string[][] = [];
    const lookups: ContentLookups = {
      place: (_sql, requested) => {
        asked.push([...requested]);
        return requested.map((id) => ({
          id,
          name: `店舗${id.slice(-2)}`,
          photoIds: [],
        }));
      },
      listing: (_sql, requested) =>
        requested.map((id) => ({ id, name: null, photoIds: ["x"] })),
    };
    const found = describeContent(
      { exec: () => ({ toArray: () => [] }) } as never,
      [p2, l1, p1, p2, { kind: "region", id: "r" }],
      lookups,
    );
    expect(found.map((summary) => summary.target)).toEqual([
      { kind: "listing", id: l1.id },
      { kind: "place", id: p1.id },
      { kind: "place", id: p2.id },
    ]);
    expect(asked).toEqual([[p2.id, p1.id]]);
    expect(found[0]).toMatchObject({ name: null, photoIds: ["x"] });
  });
});
