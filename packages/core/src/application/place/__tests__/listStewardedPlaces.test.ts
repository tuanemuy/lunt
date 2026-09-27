import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { listStewardedPlaces } from "../listStewardedPlaces";
import { type PlaceKit, placeKit } from "./kit";

const list = (k: PlaceKit, who: Person) =>
  listStewardedPlaces({ container: k.container, actor: who.actor, input: {} });

describe("listStewardedPlaces", () => {
  it("listStewardedPlaces#1 利用者 A は、店舗 p1（営業中）と店舗 p2（休業、非公開）の店舗管理者で、地域 r1 の地域運営者でもある。A が管理者でない店舗 p3 がある / A が管理する店舗の一覧を読む", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const cover = await k.photo(O);
    const A = await k.person("steward");
    const p1 = await k.place({ name: "一号店", photoIds: [cover] });
    const p2 = await k.place({ name: "二号店" });
    const p3 = await k.place({ name: "三号店" });
    await k.setStatus(p2.id, "temporarilyClosed");
    await k.suspend(p2.id);
    await k.appoint(k.placeRef(p2), A);
    await k.appoint(k.placeRef(p1), A);
    await k.appoint(k.region("r1"), A);
    await k.appoint(k.placeRef(p3), await k.person("other"));
    const views = await list(k, A);
    expect(views).toMatchObject([
      {
        placeId: p1.id,
        name: "一号店",
        cover: { photoId: cover },
        operatingStatus: "open",
        suspended: false,
      },
      {
        placeId: p2.id,
        name: "二号店",
        cover: null,
        operatingStatus: "temporarilyClosed",
        suspended: true,
      },
    ]);
    expect(p1.id < p2.id).toBe(true);
  });

  it("listStewardedPlaces#2 利用者 A は、どの店舗の管理権限も持たない / A が管理する店舗の一覧を読む", async () => {
    const k = placeKit();
    const A = await k.person();
    await k.place();
    expect(await list(k, A)).toEqual([]);
  });

  it("listStewardedPlaces#3 利用者 A は店舗 p1 の店舗管理者だったが、辞任した / A が管理する店舗の一覧を読む", async () => {
    const k = placeKit();
    const A = await k.person();
    const p1 = await k.place();
    await k.appoint(k.placeRef(p1), A);
    await k.removeSteward(k.placeRef(p1), A);
    expect(await list(k, A)).toEqual([]);
  });

  it("listStewardedPlaces#4 利用者 A は、店舗 p1 への承諾前の招待の宛先であるだけで、管理者ではない / A が管理する店舗の一覧を読む", async () => {
    const k = placeKit();
    const A = await k.person();
    const p1 = await k.place();
    await k.invite(k.placeRef(p1), A.email);
    expect(await list(k, A)).toEqual([]);
  });

  it("reads every page of stewardships and every batch of places", async () => {
    const k = placeKit();
    const A = await k.person();
    const places = [];
    for (let i = 0; i < 105; i += 1) {
      const place = await k.place({ name: `店舗${i}` });
      await k.appoint(k.placeRef(place), A);
      places.push(place);
    }
    const views = await list(k, A);
    expect(views.map((view) => view.placeId)).toEqual(
      places.map((place) => place.id).sort(),
    );
  });
});
