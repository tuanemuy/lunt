import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { matchPlaces } from "../matchPlaces";
import { type PlaceKit, placeKit, Towns } from "./kit";

const match = (
  k: PlaceKit,
  query: Readonly<{ name?: string; address?: string }>,
) =>
  matchPlaces({
    container: k.container,
    input: {
      name: query.name ?? null,
      address: query.address ?? null,
      pagination: { page: 1, limit: 20 },
    },
  });

/** 「山田珈琲店」 in 大手町 and 「山田珈琲店 別館」 in 銀座, both with photos. */
async function twoPlaces() {
  const k = placeKit();
  const O = await k.setupOperator();
  const [ph1, ph2] = [await k.photo(O), await k.photo(O)];
  const main = await k.place({ name: "山田珈琲店", photoIds: [ph1] });
  const annex = await k.place({
    name: "山田珈琲店 別館",
    town: Towns.ginza,
    addressRest: "2-2",
    photoIds: [ph2],
  });
  return { k, O, main, annex, ph1, ph2 };
}

const idsOf = (result: Readonly<{ items: readonly { placeId: string }[] }>) =>
  result.items.map((item) => item.placeId);

describe("matchPlaces", () => {
  it("matchPlaces#1 店舗「山田珈琲店」（東京都千代田区大手町、写真あり、営業中）と「山田珈琲店 別館」（東京都中央区銀座、写真あり）がある。ログインしていない / 店名「山田珈琲店」で照合する", async () => {
    const { k, main, annex, ph1, ph2 } = await twoPlaces();
    const result = await match(k, { name: "山田珈琲店" });
    expect(result.count).toBe(2);
    expect(result.items).toMatchObject([
      {
        placeId: main.id,
        name: "山田珈琲店",
        address: main.profile.address,
        operatingStatus: "open",
        cover: { source: "own", photoId: ph1 },
      },
      {
        placeId: annex.id,
        name: "山田珈琲店 別館",
        address: annex.profile.address,
        cover: { source: "own", photoId: ph2 },
      },
    ]);
    expect(result.items[0]?.cover?.displayRef.url).toContain(ph1);
  });

  it("matchPlaces#2 上と同じ / 店名「山田珈琲店 本店」で照合する", async () => {
    const { k, main } = await twoPlaces();
    expect(idsOf(await match(k, { name: "山田珈琲店 本店" }))).toEqual([
      main.id,
    ]);
  });

  it("matchPlaces#3 上と同じ / 住所「銀座」だけで照合する", async () => {
    const { k, annex } = await twoPlaces();
    expect(idsOf(await match(k, { address: "銀座" }))).toEqual([annex.id]);
  });

  it("matchPlaces#4 上と同じ / 店名を空白だけにし、住所「銀座」で照合する", async () => {
    const { k } = await twoPlaces();
    expect(await match(k, { name: " 　 ", address: "銀座" })).toEqual(
      await match(k, { address: "銀座" }),
    );
  });

  it("matchPlaces#5 上と同じ / 店名「山田珈琲店」と住所「東京都千代田区」で照合する", async () => {
    const { k, main, annex } = await twoPlaces();
    expect(
      idsOf(await match(k, { name: "山田珈琲店", address: "東京都千代田区" })),
    ).toEqual([main.id, annex.id]);
  });

  it("matchPlaces#6 写真のない店舗「海の家」があり、その店舗に公開中の掲載（写真あり）がある / 店名「海の家」で照合する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const beach = await k.place({ name: "海の家", town: Towns.chiyoda });
    const photo = await k.photo(O);
    const listing = await k.listing(beach.id, "published", photo);
    const result = await match(k, { name: "海の家" });
    expect(result.items).toMatchObject([
      {
        placeId: beach.id,
        cover: { source: "listing", listingId: listing.id, photoId: photo },
      },
    ]);
    expect(result.items[0]?.cover?.displayRef.url).toContain(photo);
  });

  it("matchPlaces#7 写真のない店舗「海の家」があり、その店舗の掲載は下書きと一時非公開だけ / 店名「海の家」で照合する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const beach = await k.place({ name: "海の家", town: Towns.chiyoda });
    await k.listing(beach.id, "draft", await k.photo(O));
    await k.listing(beach.id, "unpublished", await k.photo(O));
    const result = await match(k, { name: "海の家" });
    expect(result.count).toBe(1);
    expect(result.items).toMatchObject([{ placeId: beach.id, cover: null }]);
  });

  it("matchPlaces#8 休業の店舗「山田珈琲店 別館」と、閉店の店舗「純喫茶 山田珈琲店」がある / 店名「山田珈琲店」で照合する", async () => {
    const k = placeKit();
    const annex = await k.place({ name: "山田珈琲店 別館", town: Towns.ginza });
    const kissa = await k.place({
      name: "純喫茶 山田珈琲店",
      town: Towns.umeda,
    });
    await k.setStatus(annex.id, "temporarilyClosed");
    await k.setStatus(kissa.id, "permanentlyClosed");
    const result = await match(k, { name: "山田珈琲店" });
    expect(result.items).toMatchObject([
      { placeId: annex.id, operatingStatus: "temporarilyClosed" },
      { placeId: kissa.id, operatingStatus: "permanentlyClosed" },
    ]);
  });

  it("matchPlaces#9 非公開の店舗「山田」だけが、店名「山田」に一致する。ログインしていない / 店名「山田」で照合する", async () => {
    const k = placeKit();
    const yamada = await k.place({ name: "山田" });
    await k.suspend(yamada.id);
    expect(await match(k, { name: "山田" })).toEqual({ items: [], count: 0 });
  });

  it("matchPlaces#10 非公開の店舗「山田」だけが、店名「山田」に一致する。操作する人はサービス運営者としてログインしている / 店名「山田」で照合する", async () => {
    // `matchPlaces` takes no actor: a signed-in operator gets the same
    // answer as anyone.
    const k = placeKit();
    await k.setupOperator();
    const yamada = await k.place({ name: "山田" });
    await k.suspend(yamada.id);
    expect(await match(k, { name: "山田" })).toEqual({ items: [], count: 0 });
  });

  it("matchPlaces#11 店舗「山田珈琲店」（店舗管理者あり）がある。ログインしていない / 店名「山田珈琲店」で照合する", async () => {
    const k = placeKit();
    const main = await k.place();
    await k.appoint(k.placeRef(main), await k.person("steward"));
    const result = await match(k, { name: "山田珈琲店" });
    expect(idsOf(result)).toEqual([main.id]);
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(
      ["address", "cover", "name", "operatingStatus", "placeId"].sort(),
    );
  });

  it("matchPlaces#12 店舗がある / 店名も住所も空（空白だけ）で照合する", async () => {
    const k = placeKit();
    await k.place();
    await expectCode(
      match(k, { name: " ", address: "  " }),
      BusinessRuleError,
      "PLACE_INVALID_MATCH_CRITERIA",
    );
  });

  it("matchPlaces#13 店名「存在しない店」に一致する店舗がない / 店名「存在しない店」で照合する", async () => {
    const k = placeKit();
    await k.place();
    expect(await match(k, { name: "存在しない店" })).toEqual({
      items: [],
      count: 0,
    });
  });
});
