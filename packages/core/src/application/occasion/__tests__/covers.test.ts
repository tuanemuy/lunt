import {
  type OccasionId,
  PhotoId,
  type PlaceId,
  type RegionId,
} from "@repo/core/domain/common/ids";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { getParticipationDetails } from "../getParticipationDetails";
import { getPlaceParticipations } from "../getPlaceParticipations";
import { listAttachableListings } from "../listAttachableListings";
import { listOccasionParticipants } from "../listOccasionParticipants";
import { listOccasionRegionLinks } from "../listOccasionRegionLinks";
import { listRegionOccasionLinks } from "../listRegionOccasionLinks";
import {
  oct,
  type ParticipationKit,
  participationKit,
} from "./participationKit";

const page = { page: 1, limit: 20 } as const;

/** A cover as the management rows show it: the photo and its display ref. */
async function cover(k: ParticipationKit, photoId: PhotoId) {
  const refs = await k.container.photoStorage.displayRefs([photoId]);
  return { photoId, displayRef: refs.get(photoId) };
}

async function occasionCover(k: ParticipationKit, id: OccasionId) {
  const [first] = (await k.storedOccasion(id)).content.photos.items;
  if (first === undefined) throw new Error("no photo");
  return cover(k, first.photoId);
}

async function regionCover(k: ParticipationKit, id: RegionId) {
  const found = await k.run(({ regionRepository }) =>
    regionRepository.findById(id),
  );
  const first = found?.entity.content.photos.items[0];
  if (first === undefined) throw new Error("no photo");
  return cover(k, first.photoId);
}

/** Gives the place one photo, its cover. */
async function withPhoto(k: ParticipationKit, placeId: PlaceId) {
  const photoId = PhotoId.create(k.newId());
  await k.changePlace(
    placeId,
    (place, now) =>
      Place.updateProfile(
        place,
        sampleProfile({ name: place.profile.name, photoIds: [photoId] }),
        now,
      ).entity,
  );
  return photoId;
}

/**
 * Place P (with a photo) takes part in occasion O with listing L (photo),
 * draft D (no photo) and a deleted listing; place Q (no photo) takes part
 * without listings.
 */
async function setup() {
  const k = await participationKit();
  const p = await k.place("店舗P");
  const q = await k.place("店舗Q");
  const pPhoto = await withPhoto(k, p);
  const m = await k.manager(p, "steward");
  const l = await k.published(m, p, { name: "L" });
  const d = await k.draft(m, p, { name: "D", photos: [] });
  const gone = k.absentListingId();
  const o = await k.occasion({ name: "O" });
  await k.approved(o, p, { listingIds: [l.id, d.id, gone], dates: [oct(1)] });
  await k.approved(o, q, { dates: [oct(2)] });
  return { k, p, q, pPhoto, m, l, d, gone, o };
}

describe("covers on the management rows (SM-06, EM-01, CM-04, RQ-06, RM-03, EM-03)", () => {
  it("getPlaceParticipations: each occasion's first photo, and each attached listing's first photo with its framing; none for a listing without photos, and a deleted one has no cover field", async () => {
    const { k, p, m, l, d, gone, o } = await setup();
    const view = await getPlaceParticipations({
      container: k.container,
      actor: m.actor,
      input: { placeId: p, pagination: page },
    });
    const [item] = view.items;
    expect(item?.occasion.cover).toEqual(await occasionCover(k, o));
    expect(item?.participation.listings).toEqual([
      expect.objectContaining({ id: l.id, cover: l.photos[0] }),
      expect.objectContaining({ id: d.id, cover: null }),
      { id: gone, deleted: true },
    ]);
    expect(l.photos[0]?.display).not.toBeNull();
  });

  it("listOccasionParticipants: each place's first photo (none without photos) and the attached listings' covers", async () => {
    const { k, p, q, pPhoto, l, o } = await setup();
    const organizer = await k.organizer(o);
    const view = await listOccasionParticipants({
      container: k.container,
      actor: organizer.actor,
      input: { occasionId: o, pagination: page },
    });
    const byPlace = new Map(view.items.map((i) => [i.place.id, i]));
    expect(byPlace.get(p)?.place).toEqual({
      id: p,
      name: "店舗P",
      operatingStatus: "open",
      suspended: false,
      cover: await cover(k, pPhoto),
    });
    expect(byPlace.get(q)?.place.cover).toBeNull();
    expect(byPlace.get(p)?.participation.listings[0]).toMatchObject({
      id: l.id,
      cover: l.photos[0],
    });
  });

  it("getParticipationDetails: the occasion's cover, the place with its name, states and cover, and the attached listings' covers", async () => {
    const { k, p, pPhoto, m, l, o } = await setup();
    const view = await getParticipationDetails({
      container: k.container,
      actor: m.actor,
      input: { occasionId: o, placeId: p },
    });
    expect(view.occasion.cover).toEqual(await occasionCover(k, o));
    expect(view.place).toEqual({
      id: p,
      name: "店舗P",
      operatingStatus: "open",
      suspended: false,
      cover: await cover(k, pPhoto),
    });
    expect(view.participation?.listings[0]).toMatchObject({
      id: l.id,
      cover: l.photos[0],
    });
  });

  it("getParticipationDetails: a suspended place without photos that does not take part still comes with its states and no cover", async () => {
    const { k, o } = await setup();
    const other = await k.place("店舗R");
    await k.suspendPlace(other);
    const organizer = await k.organizer(o);
    const view = await getParticipationDetails({
      container: k.container,
      actor: organizer.actor,
      input: { occasionId: o, placeId: other },
    });
    expect(view.participation).toBeNull();
    expect(view.place).toEqual({
      id: other,
      name: "店舗R",
      operatingStatus: "open",
      suspended: true,
      cover: null,
    });
  });

  it("listAttachableListings: each candidate's first photo with its framing", async () => {
    const { k, p, m, l, o } = await setup();
    const view = await listAttachableListings({
      container: k.container,
      actor: m.actor,
      input: { occasionId: o, placeId: p, pagination: page },
    });
    expect(view.items).toEqual([
      {
        id: l.id,
        name: "L",
        cover: l.photos[0],
        offeringStatus: { phase: "available" },
      },
    ]);
  });

  it("listRegionOccasionLinks and listOccasionRegionLinks: the linked occasion's and region's first photos", async () => {
    const { k, o } = await setup();
    const r = await k.region("published", { name: "城下町" });
    await k.linked(o, r);
    const regionSteward = await k.regionSteward(r);
    const organizer = await k.organizer(o);
    const occasions = await listRegionOccasionLinks({
      container: k.container,
      actor: regionSteward.actor,
      input: { regionId: r, pagination: page },
    });
    expect(occasions.items.map((i) => i.occasion.cover)).toEqual([
      await occasionCover(k, o),
    ]);
    const regions = await listOccasionRegionLinks({
      container: k.container,
      actor: organizer.actor,
      input: { occasionId: o, pagination: page },
    });
    expect(regions.items.map((i) => i.region.cover)).toEqual([
      await regionCover(k, r),
    ]);
  });
});
