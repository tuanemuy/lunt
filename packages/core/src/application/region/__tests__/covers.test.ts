import type { PhotoId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { getPlaceAffiliationStatus } from "../getPlaceAffiliationStatus";
import { listAffiliatedPlaces } from "../listAffiliatedPlaces";
import { type RegionKit, regionKit } from "./kit";

/** A cover as the management rows show it: the photo and its display ref. */
async function cover(k: RegionKit, photoId: PhotoId) {
  const refs = await k.container.photoStorage.displayRefs([photoId]);
  return { photoId, displayRef: refs.get(photoId) };
}

describe("covers on the management rows (SM-05, RM-01)", () => {
  it("listAffiliatedPlaces: each affiliated place's first photo; none for a place without photos", async () => {
    const k = regionKit();
    const X = await k.region({ name: "X" }, "published");
    const R = await k.steward(X.id);
    const first = await k.photo(await k.setupOperator());
    const second = await k.photo(await k.setupOperator());
    const withPhotos = await k.place({
      name: "写真のある店",
      photoIds: [first, second],
    });
    const without = await k.place({ name: "写真のない店" });
    await k.affiliate(withPhotos.id, X.id);
    await k.affiliate(without.id, X.id);
    const view = await listAffiliatedPlaces({
      container: k.container,
      actor: R.actor,
      input: { regionId: X.id, pagination: { page: 1, limit: 10 } },
    });
    expect(view.items.map((i) => [i.placeId, i.cover])).toEqual([
      [without.id, null],
      [withPhotos.id, await cover(k, first)],
    ]);
  });

  it("getPlaceAffiliationStatus: each affiliated region's first photo; none for a region whose photos were all taken down", async () => {
    const k = regionKit();
    const S = await k.person("place-steward");
    const p = await k.place();
    await k.appoint(k.placeRef(p), S);
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "photoTakedown");
    await k.affiliate(p.id, X.id, Y.id);
    const [xCover] = X.content.photos.items;
    if (xCover === undefined) throw new Error("no photo");
    const status = await getPlaceAffiliationStatus({
      container: k.container,
      actor: S.actor,
      input: { placeId: p.id },
    });
    expect(status.regions.map((r) => [r.regionId, r.cover])).toEqual([
      [X.id, await cover(k, xCover.photoId)],
      [Y.id, null],
    ]);
  });
});
