import { SystemError } from "@repo/core/application/errors";
import { describe, expect, it } from "vitest";
import {
  insertPlaces,
  newPlace,
  placeIds,
} from "../__conformance__/placeFixtures";
import { createNodeHarness } from "../testing/nodeHarness";

describe("DoPlaceRepository", () => {
  it.each([
    ["text that is not JSON", "not json"],
    ["JSON that is not an array", '{"0":"x"}'],
    ["an array holding a non-string", "[1]"],
    ["an array holding a malformed id", '["not-a-photo-id"]'],
  ])("refuses a place whose stored photo_ids is %s", async (_, stored) => {
    const h = createNodeHarness();
    const ids = placeIds();
    const place = newPlace(ids.place(), { photoIds: [ids.photo()] });
    await insertPlaces(h, place);
    h.state.storage.sql.exec(
      "UPDATE places SET photo_ids = ? WHERE id = ?",
      stored,
      place.id,
    );
    const error = await h.uow
      .run(({ placeRepository }) => placeRepository.findById(place.id))
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({ code: "DATA_INTEGRITY_ERROR" });
  });
});
