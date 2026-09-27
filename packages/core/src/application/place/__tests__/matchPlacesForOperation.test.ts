import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { matchPlacesForOperation } from "../matchPlacesForOperation";
import { type PlaceKit, placeKit, Towns } from "./kit";

const find = (
  k: PlaceKit,
  who: Person,
  query: Readonly<{ name?: string; address?: string }>,
) =>
  matchPlacesForOperation({
    container: k.container,
    actor: who.actor,
    input: {
      name: query.name ?? null,
      address: query.address ?? null,
      pagination: { page: 1, limit: 20 },
    },
  });

async function operatorKit() {
  const k = placeKit();
  const O = await k.setupOperator();
  return { k, O };
}

describe("matchPlacesForOperation", () => {
  it("matchPlacesForOperation#1 非公開の店舗「山田」（店舗管理者あり）と、公開されている店舗「山田珈琲店」（管理者不在）と「山田珈琲店 別館」（休業）がある。操作する人はサービス運営者 O / O が、店名「山田珈琲店」で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    const cover = await k.photo(O);
    const yamada = await k.place({
      name: "山田",
      town: Towns.umeda,
      addressRest: "4-4",
    });
    await k.appoint(k.placeRef(yamada), await k.person("steward"));
    await k.suspend(yamada.id);
    const coffee = await k.place({ name: "山田珈琲店", photoIds: [cover] });
    const annex = await k.place({
      name: "山田珈琲店 別館",
      town: Towns.ginza,
      addressRest: "2-2",
    });
    await k.setStatus(annex.id, "temporarilyClosed");
    const result = await find(k, O, { name: "山田珈琲店" });
    expect(result.count).toBe(3);
    expect(result.items).toMatchObject([
      {
        placeId: coffee.id,
        name: "山田珈琲店",
        address: coffee.profile.address,
        cover: { photoId: cover },
        operatingStatus: "open",
        suspended: false,
        hasSteward: false,
      },
      {
        placeId: annex.id,
        name: "山田珈琲店 別館",
        cover: null,
        operatingStatus: "temporarilyClosed",
        suspended: false,
        hasSteward: false,
      },
      {
        placeId: yamada.id,
        name: "山田",
        operatingStatus: "open",
        suspended: true,
        hasSteward: true,
      },
    ]);
  });

  it("matchPlacesForOperation#2 店舗「山田珈琲店」（東京都千代田区大手町）と、非公開の店舗「山田珈琲店 別館」（東京都中央区銀座）がある。操作する人はサービス運営者 O / O が、店名を空にし、住所「銀座」で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    await k.place();
    const annex = await k.place({
      name: "山田珈琲店 別館",
      town: Towns.ginza,
      addressRest: "2-2",
    });
    await k.suspend(annex.id);
    const result = await find(k, O, { name: "", address: "銀座" });
    expect(result.items.map((item) => item.placeId)).toEqual([annex.id]);
    expect(result.items[0]?.suspended).toBe(true);
  });

  it("matchPlacesForOperation#3 店舗「山田珈琲店」（東京都千代田区大手町）と「山田珈琲店 別館」（東京都中央区銀座）がある。操作する人はサービス運営者 O / O が、店名「山田珈琲店」と住所「東京都千代田区」で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    const annex = await k.place({
      name: "山田珈琲店 別館",
      town: Towns.ginza,
      addressRest: "2-2",
    });
    const coffee = await k.place();
    const result = await find(k, O, {
      name: "山田珈琲店",
      address: "東京都千代田区",
    });
    expect(result.items.map((item) => item.placeId)).toEqual([
      coffee.id,
      annex.id,
    ]);
  });

  it("matchPlacesForOperation#4 写真のない非公開の店舗「海の家」があり、その店舗に公開中の掲載（写真あり）がある。操作する人はサービス運営者 O / O が、店名「海の家」で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    const beach = await k.place({ name: "海の家", town: Towns.chiyoda });
    await k.listing(beach.id, "published", await k.photo(O));
    await k.suspend(beach.id);
    const result = await find(k, O, { name: "海の家" });
    expect(result.items).toMatchObject([
      { placeId: beach.id, suspended: true, cover: null },
    ]);
  });

  it("matchPlacesForOperation#5 操作する人は、サービス運営者の役割を持たない店舗管理者 A / A が、店名「山田」で店舗を探す", async () => {
    const { k } = await operatorKit();
    const p1 = await k.place({ name: "山田" });
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    await expectCode(find(k, A, { name: "山田" }), ForbiddenError);
  });

  it("matchPlacesForOperation#6 店舗がある。操作する人はサービス運営者 O / O が、店名も住所も空（空白だけ）で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    await k.place();
    await expectCode(
      find(k, O, { name: "  ", address: "　" }),
      BusinessRuleError,
      "PLACE_INVALID_MATCH_CRITERIA",
    );
  });

  it("matchPlacesForOperation#7 店名「存在しない店」に一致する店舗がない。操作する人はサービス運営者 O / O が、店名「存在しない店」で店舗を探す", async () => {
    const { k, O } = await operatorKit();
    await k.place();
    expect(await find(k, O, { name: "存在しない店" })).toEqual({
      items: [],
      count: 0,
    });
  });
});
