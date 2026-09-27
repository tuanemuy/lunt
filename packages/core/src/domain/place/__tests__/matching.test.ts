import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { MatchText, PlaceMatchCriteria, PlaceMatching } from "../matching";
import { Place } from "../place";
import { SampleAddress, samplePlace, samplePlaceId } from "../testing/samples";

const place = (name: string, address = SampleAddress.otemachi()) =>
  samplePlace(samplePlaceId(1), { name, address });

const criteria = (
  name: string | null,
  address: string | null = null,
  includeSuspended = true,
) => PlaceMatchCriteria.create({ name, address, includeSuspended });

describe("MatchText / PlaceMatchCriteria", () => {
  it("normalizes the term", () => {
    expect(MatchText.create("ＹＡＭＡＤＡ　ｃｏｆｆｅｅ")).toBe("yamadacoffee");
    expectBusinessError(
      () => MatchText.create(" 　"),
      "PLACE_INVALID_MATCH_TEXT",
    );
  });

  it("treats a blank name or address as not entered", () => {
    expect(criteria("  ", "銀座").text).toEqual({
      name: null,
      address: "銀座",
    });
    expect(criteria("山田", null).text).toEqual({
      name: "山田",
      address: null,
    });
    expectBusinessError(
      () => criteria(" ", "　"),
      "PLACE_INVALID_MATCH_CRITERIA",
    );
    expectBusinessError(
      () => criteria(null, null),
      "PLACE_INVALID_MATCH_CRITERIA",
    );
  });
});

describe("PlaceMatching", () => {
  it("scores equal 4, prefix 3, contains 2, contained-in-term 1", () => {
    const c = criteria("山田珈琲店");
    expect(PlaceMatching.relevance(place("山田珈琲店"), c)).toBe(4);
    expect(PlaceMatching.relevance(place("山田珈琲店 別館"), c)).toBe(3);
    expect(PlaceMatching.relevance(place("純喫茶 山田珈琲店"), c)).toBe(2);
    expect(PlaceMatching.relevance(place("山田"), c)).toBe(1);
    expect(PlaceMatching.relevance(place("川辺食堂"), c)).toBe(0);
  });

  it("finds the stored name inside a longer term", () => {
    const c = criteria("山田珈琲店 本店");
    expect(PlaceMatching.relevance(place("山田珈琲店"), c)).toBe(1);
    expect(PlaceMatching.relevance(place("山田珈琲店 別館"), c)).toBe(0);
  });

  it("adds the address score to the name score", () => {
    const c = criteria("山田珈琲店", "東京都千代田区");
    expect(PlaceMatching.relevance(place("山田珈琲店"), c)).toBe(7);
    expect(
      PlaceMatching.relevance(
        place("山田珈琲店 別館", SampleAddress.ginza()),
        c,
      ),
    ).toBe(3);
    expect(
      PlaceMatching.relevance(place("海の家", SampleAddress.chiyoda()), c),
    ).toBe(3);
  });

  it("excludes suspended places unless included; status never filters", () => {
    const closed = Place.changeOperatingStatus(
      place("山田"),
      "permanentlyClosed",
      new Date(),
    ).entity;
    const suspended = Place.suspend(place("山田"), new Date()).entity;
    expect(PlaceMatching.matches(closed, criteria("山田", null, false))).toBe(
      true,
    );
    expect(
      PlaceMatching.matches(suspended, criteria("山田", null, false)),
    ).toBe(false);
    expect(PlaceMatching.matches(suspended, criteria("山田", null, true))).toBe(
      true,
    );
  });

  it("gives the name and the address text to keyword search", () => {
    expect(PlaceMatching.searchableText(place("山田珈琲店"))).toEqual({
      primary: "山田珈琲店",
      secondary: ["東京都千代田区大手町1-1"],
    });
  });
});
