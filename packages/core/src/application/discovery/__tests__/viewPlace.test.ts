import { PERIODS } from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import type { Actor } from "@repo/core/domain/common/actor";
import { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../errors";
import { PLACE_NOT_FOUND, viewPlace } from "../viewPlace";
import { type DiscoveryKit, discoveryKit } from "./kit";

const view = (k: DiscoveryKit, placeId: PlaceId, actor: Actor | null = null) =>
  viewPlace({ container: k.container, actor, input: { placeId } });

const regionIds = (out: Awaited<ReturnType<typeof view>>) =>
  out.regions.map((summary) => summary.regionId);

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as NotFoundError).code).toBe(PLACE_NOT_FOUND);
}

describe("viewPlace", () => {
  it("viewPlace#1 営業中の店舗 P に、所属地域と、参加中の開催前のイベントがある。ログインしていない / P を読む", async () => {
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
    const X = await k.w.region();
    await k.w.affiliate(P.id, [X.id]);
    const E = await k.w.occasion({ period: PERIODS.upcoming });
    await k.w.participate(E.id, P.id);
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
    expect(out.regions).toEqual([
      {
        regionId: X.id,
        cover: {
          source: "own",
          photoId: X.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: X.content.name,
        tagline: X.content.tagline,
        address: X.content.address,
        location: X.content.location,
      },
    ]);
    expect(out.occasions).toEqual([
      {
        occasionId: E.id,
        cover: {
          source: "own",
          photoId: E.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: E.content.name,
        tagline: E.content.tagline,
        period: E.content.period,
        venue: E.content.venue,
        standing: { kind: "occasion", holding: "upcoming" },
      },
    ]);
    expect(out.viewerIsSteward).toBe(false);
    expect(Object.keys(out.photos).sort()).toEqual(
      [
        ...P.profile.photos.items.map((photo) => photo.photoId),
        ...X.content.photos.items.map((photo) => photo.photoId),
        ...E.content.photos.items.map((photo) => photo.photoId),
      ].sort(),
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

  it("viewPlace#4 店舗が地域 X・Y の順に所属し、代表地域を選んでいない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const X = await k.w.region();
    const Y = await k.w.region();
    await k.w.affiliate(P.id, [X.id, Y.id]);
    expect(regionIds(await view(k, P.id))).toEqual([X.id, Y.id]);
  });

  it("viewPlace#5 店舗が地域 X・Y・Z の順に所属し、代表地域に Z を選んでいる。Z は公開の取り下げ中 / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const X = await k.w.region();
    const Y = await k.w.region();
    const Z = await k.w.region({ state: "unpublished" });
    await k.w.affiliate(P.id, [X.id, Y.id, Z.id], Z.id);
    expect(regionIds(await view(k, P.id))).toEqual([X.id, Y.id]);
  });

  it("viewPlace#6 店舗が、開催前のイベント E1、開催中のイベント E2、終了したイベント E3、中止のイベント E4 に参加中 / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const E1 = await k.w.occasion({ period: PERIODS.upcoming });
    const E2 = await k.w.occasion({ period: PERIODS.ongoing });
    const E3 = await k.w.occasion({ period: PERIODS.ended });
    const E4 = await k.w.occasion({ state: "cancelled" });
    for (const E of [E1, E2, E3, E4]) await k.w.participate(E.id, P.id);
    const out = await view(k, P.id);
    expect(out.occasions.map((summary) => summary.occasionId)).toEqual([
      E2.id,
      E1.id,
    ]);
    expect(out.occasions.map((summary) => summary.standing.holding)).toEqual([
      "ongoing",
      "upcoming",
    ]);
  });

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
