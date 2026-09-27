import type { UnitOfWorkProvider } from "@repo/core/application/execution/unitOfWork";
import { Listing } from "@repo/core/domain/listing/listing";
import type { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { resolveReferences } from "../resolveReferences";
import { type DiscoveryKit, discoveryKit } from "./kit";

const listingRef = (listing: Pick<Listing, "id">) =>
  ({ kind: "listing", id: listing.id }) as const;
const placeRef = (place: Pick<Place, "id">) =>
  ({ kind: "place", id: place.id }) as const;

type Ref = ReturnType<typeof listingRef> | ReturnType<typeof placeRef>;

const resolve = (k: DiscoveryKit, refs: readonly Ref[]) =>
  resolveReferences({ container: k.container, input: { refs } });

const shapeOf = (out: Awaited<ReturnType<typeof resolve>>) =>
  out.items.map((item) => ({ ref: item.ref, viewable: item.viewable }));

describe("resolveReferences", () => {
  it("resolveReferences#1 提供中の掲載 L と、営業中の店舗 P がある。ログインしていない / L、P の順の参照で、Actor なしで解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const out = await resolve(k, [listingRef(L), placeRef(P)]);
    expect(out.items).toEqual([
      {
        ref: listingRef(L),
        viewable: true,
        target: {
          kind: "listing",
          summary: expect.objectContaining({
            listingId: L.id,
            placeId: P.id,
            listingName: L.content.name,
            placeName: P.profile.name,
            standing: {
              kind: "listing",
              offering: { phase: "available" },
              operating: "open",
            },
          }),
        },
      },
      {
        ref: placeRef(P),
        viewable: true,
        target: {
          kind: "place",
          summary: expect.objectContaining({
            placeId: P.id,
            name: P.profile.name,
            standing: { kind: "place", operating: "open" },
          }),
        },
      },
    ]);
  });

  it("resolveReferences#2 提供開始前の掲載、提供終了の掲載、休業中の店舗、閉店した店舗がある / それぞれの参照で解決する", async () => {
    const k = await discoveryKit();
    const open = await k.w.place();
    const resting = await k.w.place({ status: "temporarilyClosed" });
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const upcoming = await k.w.upcoming(open.id, "2026-07-20");
    const ended = await k.w.endedByHand(open.id);
    const out = await resolve(k, [
      listingRef(upcoming),
      listingRef(ended),
      placeRef(resting),
      placeRef(closed),
    ]);
    const standings = out.items.map((item) =>
      item.viewable ? item.target.summary.standing : null,
    );
    expect(standings).toEqual([
      {
        kind: "listing",
        offering: { phase: "upcoming", startsOn: "2026-07-20" },
        operating: "open",
      },
      {
        kind: "listing",
        offering: { phase: "ended", cause: "manual", scheduleElapsed: false },
        operating: "open",
      },
      { kind: "place", operating: "temporarilyClosed" },
      { kind: "place", operating: "permanentlyClosed" },
    ]);
  });

  it("resolveReferences#3 一時非公開の掲載、運営による非公開の掲載、非公開の店舗の掲載、非公開の店舗、削除された掲載の参照がある / それぞれの参照で解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const hidden = await k.w.place({ suspended: true });
    const deleted = await k.w.available(P.id);
    await k.w.deleteListing(deleted);
    const refs: readonly Ref[] = [
      listingRef(await k.w.unpublished(P.id)),
      listingRef(await k.w.suspendedListing(P.id)),
      listingRef(await k.w.available(hidden.id)),
      placeRef(hidden),
      listingRef(deleted),
    ];
    for (const ref of refs) {
      expect((await resolve(k, [ref])).items).toEqual([
        { ref, viewable: false },
      ]);
    }
  });

  it("resolveReferences#4 閲覧できる掲載 L1、一時非公開の掲載 L2、閲覧できる店舗 P がある / L1、L2、P の順の参照で解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L1 = await k.w.available(P.id);
    const L2 = await k.w.unpublished(P.id);
    const out = await resolve(k, [listingRef(L1), listingRef(L2), placeRef(P)]);
    expect(shapeOf(out)).toEqual([
      { ref: listingRef(L1), viewable: true },
      { ref: listingRef(L2), viewable: false },
      { ref: placeRef(P), viewable: true },
    ]);
  });

  it("resolveReferences#5 ログインしていない閲覧者が端末に保存した掲載 L が、保存の後に一時非公開になった / 端末の保存の参照（L を含む）で、Actor なしで解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const other = await k.w.available(P.id);
    await k.w.updateListing(
      L,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    const out = await resolve(k, [listingRef(L), listingRef(other)]);
    expect(out.items[0]).toEqual({ ref: listingRef(L), viewable: false });
    expect(out.items[1]?.viewable).toBe(true);
  });

  it("resolveReferences#6 ログインしていない閲覧者が、端末に保存を持つ（1件以上の場合と、0件の場合） / 端末の保存の参照で、Actor なしで解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    expect(shapeOf(await resolve(k, [listingRef(L), placeRef(P)]))).toEqual([
      { ref: listingRef(L), viewable: true },
      { ref: placeRef(P), viewable: true },
    ]);
    expect(await resolve(k, [])).toEqual({ items: [], photos: {} });
  });

  it("resolveReferences#7 一時非公開だった掲載 L が、再び公開されている / L の参照で解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.unpublished(P.id);
    await k.w.updateListing(L, (s) => Listing.publish(s, k.w.f.tick()).entity);
    const [item] = (await resolve(k, [listingRef(L)])).items;
    expect(item?.viewable).toBe(true);
  });

  it("resolveReferences#8 写真のない店舗 P に、写真のある閲覧できる掲載がある / P の参照で解決する", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const photo = L.content.photos.items[0];
    const out = await resolve(k, [placeRef(P)]);
    const [item] = out.items;
    expect(
      item?.viewable === true && item.target.kind === "place"
        ? item.target.summary.cover
        : undefined,
    ).toEqual({
      source: "listing",
      listingId: L.id,
      photoId: photo.photoId,
      framing: photo.framing,
    });
    expect(out.photos[photo.photoId]).toBeDefined();
  });

  it("resolveReferences#9 閲覧できる掲載 L がある / L の参照で解決した後、保存されているものを確かめる", async () => {
    let runs = 0;
    const k = await discoveryKit();
    const counting: UnitOfWorkProvider = {
      run: (fn) => {
        runs += 1;
        return k.container.unitOfWorkProvider.run(fn);
      },
    };
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const before = await k.storedEvents();
    await resolveReferences({
      container: { ...k.container, unitOfWorkProvider: counting },
      input: { refs: [listingRef(L)] },
    });
    expect(runs).toBe(0);
    expect(await k.storedEvents()).toEqual(before);
  });

  it("resolveReferences#10 参照が0件 / 解決する", async () => {
    const k = await discoveryKit();
    expect(await resolve(k, [])).toEqual({ items: [], photos: {} });
  });
});
