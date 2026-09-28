import { AreaSelection } from "@repo/core/domain/area/areaSelection";
import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import { PostalCode } from "@repo/core/domain/area/postalCode";
import { type Town, Town as TownFns } from "@repo/core/domain/area/town";
import { TownRef } from "@repo/core/domain/area/townRef";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";

describe("PostalCode.create", () => {
  it.each([
    ["7 digits", "1040061", "1040061"],
    ["a hyphen", "104-0061", "1040061"],
    ["full-width digits and hyphen", "１０４－００６１", "1040061"],
    ["spaces (full-width too)", " 104　0061 ", "1040061"],
    ["a prolonged sound mark for the hyphen", "104ー0061", "1040061"],
    ["a minus sign", "104−0061", "1040061"],
  ])("normalises %s", (_label, input, expected) => {
    expect(PostalCode.create(input)).toBe(expected);
  });

  it.each([
    ["6 digits", "104006"],
    ["5 digits", "10400"],
    ["8 digits", "10400611"],
    ["letters", "104006a"],
    ["empty", ""],
    ["other symbols", "104/0061"],
  ])("rejects %s", (_label, input) => {
    expectBusinessError(
      () => PostalCode.create(input),
      "AREA_INVALID_POSTAL_CODE",
    );
  });

  it("accepts every 7-digit string with any hyphen placement", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9]{7}$/),
        fc.integer({ min: 0, max: 7 }),
        (digits, at) => {
          const input = `${digits.slice(0, at)}-${digits.slice(at)}`;
          expect(PostalCode.create(input)).toBe(digits);
        },
      ),
    );
  });

  it("formats with a hyphen after three digits", () => {
    expect(PostalCode.format("1000005")).toBe("100-0005");
  });
});

describe("PrefectureCode / MunicipalityCode", () => {
  it("accepts 01 to 47", () => {
    for (let n = 1; n <= 47; n += 1) {
      const code = String(n).padStart(2, "0");
      expect(PrefectureCode.create(code)).toBe(code);
    }
  });

  it.each(["00", "48", "99", "1", "013", "ab", ""])(
    "rejects prefecture code %j",
    (input) => {
      expectBusinessError(
        () => PrefectureCode.create(input),
        "AREA_INVALID_PREFECTURE_CODE",
      );
    },
  );

  it("accepts 5 digits under a prefecture and tells the prefecture", () => {
    const code = MunicipalityCode.create("27127");
    expect(code).toBe("27127");
    expect(MunicipalityCode.prefectureOf(code)).toBe("27");
  });

  it.each(["00101", "48101", "1310", "131011", "1310a", ""])(
    "rejects municipality code %j",
    (input) => {
      expectBusinessError(
        () => MunicipalityCode.create(input),
        "AREA_INVALID_MUNICIPALITY_CODE",
      );
    },
  );
});

const tokyo = { code: PrefectureCode.create("13"), name: "東京都" };
const chiyoda = {
  code: MunicipalityCode.create("13101"),
  prefectureCode: tokyo.code,
  name: "千代田区",
};

function town(areaCode: string, name: string, kana: string): Town {
  return {
    areaCode: AreaCode.create(areaCode),
    prefecture: tokyo,
    municipality: chiyoda,
    name,
    kana,
  };
}

describe("Town", () => {
  it("labels with the postal code and the place name", () => {
    expect(TownFns.label(town("1000005", "丸の内", "マルノウチ"))).toBe(
      "100-0005 東京都千代田区丸の内",
    );
  });

  it("labels the whole-municipality town with prefecture and municipality only", () => {
    expect(TownFns.label(town("1000000", "", ""))).toBe(
      "100-0000 東京都千代田区",
    );
  });

  it("builds an address from the town and the trimmed rest", () => {
    const address = TownFns.toAddress(
      town("1000005", "丸の内", "マルノウチ"),
      "  1-1-1 ",
    );
    expect(address).toEqual({
      areaCode: "1000005",
      prefecture: "東京都",
      municipality: "千代田区",
      town: "丸の内",
      rest: "1-1-1",
    });
  });

  it("builds an address with an empty town from the whole-municipality town", () => {
    const address = TownFns.toAddress(town("1000000", "", ""), "永田町1-7-1");
    expect(address.town).toBe("");
    expect(address.rest).toBe("永田町1-7-1");
  });

  it("orders the whole-municipality town first, then kana, areaCode, name by code point", () => {
    const whole = town("1000000", "", "");
    const a = town("9990002", "みどり東", "ミドリ");
    const b = town("9990002", "あさひ", "ミドリ");
    const c = town("9990003", "みどり", "ミドリ");
    const d = town("1000004", "大手町", "オオテマチ");
    const sorted = [c, a, d, b, whole].sort(TownFns.compare);
    expect(sorted).toEqual([whole, d, b, a, c]);
  });

  it("labels and addresses the 「…の次に番地がくる場合」 town like the whole municipality, told apart by postal code", () => {
    const whole = town("1000000", "", "");
    const numberFollows = town("1000091", "", "");
    expect(TownFns.label(numberFollows)).toBe("100-0091 東京都千代田区");
    expect(TownFns.label(whole)).toBe("100-0000 東京都千代田区");
    expect(TownFns.equals(whole, numberFollows)).toBe(false);
    const address = TownFns.toAddress(numberFollows, "123番地");
    expect(address).toMatchObject({
      areaCode: "1000091",
      town: "",
      rest: "123番地",
    });
    expect(
      [town("1000004", "大手町", "オオテマチ"), numberFollows, whole].sort(
        TownFns.compare,
      ),
    ).toEqual([whole, numberFollows, town("1000004", "大手町", "オオテマチ")]);
  });

  it("is equal when areaCode, municipality and name match, regardless of kana", () => {
    expect(
      TownFns.equals(town("1000004", "大手町", "オオテマチ"), {
        ...town("1000004", "大手町", "ベツ"),
      }),
    ).toBe(true);
    expect(
      TownFns.equals(
        town("1000004", "大手町", "オオテマチ"),
        town("1000004", "丸の内", "オオテマチ"),
      ),
    ).toBe(false);
  });
});

describe("TownRef", () => {
  it("is built through the code value objects", () => {
    expect(
      TownRef.create({
        areaCode: "1000004",
        municipalityCode: "13101",
        name: "大手町",
      }),
    ).toEqual({
      areaCode: "1000004",
      municipalityCode: "13101",
      name: "大手町",
    });
    expectBusinessError(
      () =>
        TownRef.create({
          areaCode: "100-0004",
          municipalityCode: "13101",
          name: "大手町",
        }),
      "COMMON_INVALID_AREA_CODE",
    );
    expectBusinessError(
      () =>
        TownRef.create({
          areaCode: "1000004",
          municipalityCode: "131",
          name: "大手町",
        }),
      "AREA_INVALID_MUNICIPALITY_CODE",
    );
  });

  it("matches only the town with all three values", () => {
    const t = town("1000004", "大手町", "オオテマチ");
    expect(TownRef.matches(TownRef.of(t), t)).toBe(true);
    expect(TownRef.matches({ ...TownRef.of(t), name: "丸の内" }, t)).toBe(
      false,
    );
  });
});

describe("AreaSelection", () => {
  const pref = AreaSelection.prefecture(PrefectureCode.create("13"));
  const muni = AreaSelection.municipality(MunicipalityCode.create("13101"));
  const area = AreaSelection.area(AreaCode.create("1040061"));

  it("dedupes equal selections, keeping first occurrences in order", () => {
    expect(
      AreaSelection.dedupe([
        pref,
        area,
        AreaSelection.prefecture(PrefectureCode.create("13")),
        muni,
        area,
      ]),
    ).toEqual([pref, area, muni]);
  });

  it("treats the same code under different units as different", () => {
    expect(
      AreaSelection.equals(
        AreaSelection.prefecture(PrefectureCode.create("13")),
        pref,
      ),
    ).toBe(true);
    expect(AreaSelection.equals(pref, muni)).toBe(false);
  });

  it("is built from transport input through the code value objects", () => {
    expect(
      AreaSelection.create({ unit: "municipality", municipalityCode: "13101" }),
    ).toEqual(muni);
    expectBusinessError(
      () => AreaSelection.create({ unit: "prefecture", prefectureCode: "48" }),
      "AREA_INVALID_PREFECTURE_CODE",
    );
    expectBusinessError(
      () => AreaSelection.create({ unit: "area", areaCode: "104" }),
      "COMMON_INVALID_AREA_CODE",
    );
  });
});
