import { describe, expect, it } from "vitest";
import {
  insertPlaces,
  newPlace,
  placeIds,
  suspended,
} from "../__conformance__/placeFixtures";
import { placeContentLookup, placeStewardedTargetLookup } from "../store/place";
import { createNodeHarness } from "../testing/nodeHarness";

// The `place` entries Place contributes to `STEWARDED_TARGET_LOOKUPS` and
// `CONTENT_LOOKUPS`, over places stored through the repository.
describe("place lookups", () => {
  it("name stored places among the ids, suspended ones included, with photos in order", async () => {
    const h = createNodeHarness();
    const ids = placeIds();
    const [ph1, ph2] = [ids.photo(), ids.photo()];
    const p1 = newPlace(ids.place(), { name: "一号店", photoIds: [ph2, ph1] });
    const p2 = suspended(newPlace(ids.place(), { name: "二号店" }));
    const absent = ids.place();
    await insertPlaces(h, p1, p2);
    const { sql } = h.state.storage;
    const byId = <T extends { id: string }>(rows: readonly T[]) =>
      [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

    expect(
      byId(placeStewardedTargetLookup(sql, [p2.id, p1.id, absent])),
    ).toEqual([
      { id: p1.id, name: "一号店" },
      { id: p2.id, name: "二号店" },
    ]);
    expect(byId(placeContentLookup(sql, [p1.id, p2.id, absent]))).toEqual([
      { id: p1.id, name: "一号店", photoIds: [ph2, ph1] },
      { id: p2.id, name: "二号店", photoIds: [] },
    ]);
  });
});
