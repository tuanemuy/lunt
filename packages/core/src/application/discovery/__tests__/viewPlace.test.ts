import type { Actor } from "@repo/core/domain/common/actor";
import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../errors";
import { PLACE_NOT_FOUND, viewPlace } from "../viewPlace";
import { type DiscoveryKit, discoveryKit } from "./kit";

const view = (k: DiscoveryKit, placeId: PlaceId, actor: Actor | null = null) =>
  viewPlace({ container: k.container, actor, input: { placeId } });

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as NotFoundError).code).toBe(PLACE_NOT_FOUND);
}

describe("viewPlace", () => {
  it.todo(
    "viewPlace#1 営業中の店舗 P に、所属地域と、参加中の開催前のイベントがある。ログインしていない / P を読む",
  );

  it("returns the place's photos in order, name, description, address, location, hours, contact and operating status, signed out (stage 2 part of #1)", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({
      photos: 2,
      profile: {
        description: "駅前の喫茶店",
        businessHours: "8:00〜18:00",
        contact: "03-0000-0000",
      },
    });
    await k.w.available(P.id);
    const out = await view(k, P.id);
    expect(out.place).toEqual({
      placeId: P.id,
      name: P.profile.name,
      photos: P.profile.photos.items,
      description: P.profile.description,
      address: P.profile.address,
      location: P.profile.location,
      visitInfo: P.profile.visitInfo,
      standing: { kind: "place", operating: "open" },
    });
    expect(out.regions).toEqual([]);
    expect(out.occasions).toEqual([]);
    expect(out.viewerIsSteward).toBe(false);
    expect(Object.keys(out.photos).sort()).toEqual(
      P.profile.photos.items.map((photo) => photo.photoId).sort(),
    );
  });

  it("viewPlace#2 写真のない店舗 P に、写真のある公開中の掲載がある / P を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.available(P.id);
    const out = await view(k, P.id);
    expect(out.place.photos).toEqual([]);
    expect(out.photos).toEqual({});
  });

  it("viewPlace#3 休業中の店舗と、閉店した店舗 / それぞれを読む", async () => {
    const k = await discoveryKit();
    for (const status of ["temporarilyClosed", "permanentlyClosed"] as const) {
      const P = await k.w.place({ status });
      const out = await view(k, P.id);
      expect(out.place.standing).toEqual({ kind: "place", operating: status });
      expect(out.place.location).toEqual(P.profile.location);
    }
  });

  it.todo(
    "viewPlace#4 店舗が地域 X・Y の順に所属し、代表地域を選んでいない / 読む",
  );
  it.todo(
    "viewPlace#5 店舗が地域 X・Y・Z の順に所属し、代表地域に Z を選んでいる。Z は公開の取り下げ中 / 読む",
  );
  it.todo(
    "viewPlace#6 店舗が、開催前のイベント E1、開催中のイベント E2、終了したイベント E3、中止のイベント E4 に参加中 / 読む",
  );

  it("viewPlace#7 店舗に店舗管理者がいない。ログインしていない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const out = await view(k, P.id);
    expect(out.placeIsVacant).toBe(true);
    expect(out.viewerIsSteward).toBe(false);
  });

  it("viewPlace#8 店舗に店舗管理者 A がいる / A として読む。別に、店舗管理者でない利用者 B として読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const A = await k.person();
    const B = await k.person();
    await k.appoint(P.id, A);
    const asA = await view(k, P.id, A.actor);
    const asB = await view(k, P.id, B.actor);
    expect([asA.placeIsVacant, asA.viewerIsSteward]).toEqual([false, true]);
    expect([asB.placeIsVacant, asB.viewerIsSteward]).toEqual([false, false]);
  });

  it("viewPlace#9 店舗が非公開。または、その ID の店舗がない / その店舗を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ suspended: true });
    await expectNotFound(view(k, P.id));
    await expectNotFound(view(k, PlaceId.create(k.idGenerator.next())));
  });

  it("viewPlace#10 非公開の店舗の店舗管理者 A / A としてその店舗を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ suspended: true });
    const A = await k.person();
    await k.appoint(P.id, A);
    await expectNotFound(view(k, P.id, A.actor));
  });
});
