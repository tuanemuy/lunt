import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { RehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "../../common/__tests__/expectBusinessError";
import { Place } from "../place";
import { PlaceRevision } from "../revision";
import {
  SAMPLE_NOW,
  SampleAddress,
  samplePhotoId,
  samplePlace,
  samplePlaceId,
  sampleProfile,
} from "../testing/samples";

const LATER = new Date("2026-09-29T00:00:00.000Z");
const ph = samplePhotoId;
const photoIdsOf = (place: Place) =>
  place.profile.photos.items.map((photo) => photo.photoId);

describe("Place.register", () => {
  it("creates an open, unsuspended place at version 0 with no event", () => {
    const { entity, eventDrafts } = Place.register(
      { id: samplePlaceId(1), profile: sampleProfile() },
      SAMPLE_NOW,
    );
    expect(entity).toMatchObject({
      operatingStatus: "open",
      suspension: { suspended: false },
      registeredAt: SAMPLE_NOW,
      updatedAt: SAMPLE_NOW,
      version: 0,
    });
    expect(Place.isSuspended(entity)).toBe(false);
    expect(eventDrafts).toEqual([]);
  });
});

describe("Place.updateProfile", () => {
  it("replaces the profile, advances the version and releases dropped photos", () => {
    const place = samplePlace(samplePlaceId(1), { photoIds: [ph(1), ph(2)] });
    const { entity, eventDrafts } = Place.updateProfile(
      place,
      sampleProfile({ name: "川辺食堂", photoIds: [ph(3), ph(2)] }),
      LATER,
    );
    expect(entity.profile.name).toBe("川辺食堂");
    expect(photoIdsOf(entity)).toEqual([ph(3), ph(2)]);
    expect(entity).toMatchObject({
      version: 1,
      updatedAt: LATER,
      registeredAt: SAMPLE_NOW,
      operatingStatus: "open",
    });
    expect(eventDrafts).toEqual([
      {
        type: "photos.released",
        payload: { photoIds: [ph(1)] },
        occurredAt: LATER,
        aggregateId: place.id,
      },
    ]);
  });

  it("returns the place as is for an equal profile", () => {
    const place = samplePlace();
    const result = Place.updateProfile(place, sampleProfile(), LATER);
    expect(result.entity).toBe(place);
    expect(result.eventDrafts).toEqual([]);
  });

  it("keeps the takedown marker only while the photo order is unchanged", () => {
    const place = Place.takeDownPhotos(
      samplePlace(samplePlaceId(1), { photoIds: [ph(1), ph(2)] }),
      [ph(1)],
      SAMPLE_NOW,
    ).entity;
    const describedOnly = Place.updateProfile(
      place,
      sampleProfile({ photoIds: [ph(2)], description: "紹介" }),
      LATER,
    ).entity;
    expect(describedOnly.profile.photos.takenDown).toBe(true);
    const reordered = Place.updateProfile(
      describedOnly,
      sampleProfile({ photoIds: [ph(3), ph(2)], description: "紹介" }),
      LATER,
    ).entity;
    expect(reordered.profile.photos.takenDown).toBe(false);
  });
});

describe("Place.changeOperatingStatus", () => {
  it("changes between any statuses and emits from / to", () => {
    const place = samplePlace();
    const closed = Place.changeOperatingStatus(
      place,
      "permanentlyClosed",
      LATER,
    );
    expect(closed.entity).toMatchObject({
      operatingStatus: "permanentlyClosed",
      version: 1,
      updatedAt: LATER,
    });
    expect(closed.eventDrafts).toEqual([
      {
        type: "place.operating_status_changed",
        payload: { placeId: place.id, from: "open", to: "permanentlyClosed" },
        occurredAt: LATER,
        aggregateId: place.id,
      },
    ]);
    const reopened = Place.changeOperatingStatus(closed.entity, "open", LATER);
    expect(reopened.entity.operatingStatus).toBe("open");
  });

  it("returns the place as is for the same status", () => {
    const place = samplePlace();
    const result = Place.changeOperatingStatus(place, "open", LATER);
    expect(result.entity).toBe(place);
    expect(result.eventDrafts).toEqual([]);
  });
});

describe("Place.suspend / unsuspend", () => {
  it("suspends and lifts, leaving profile and status alone", () => {
    const place = Place.changeOperatingStatus(
      samplePlace(),
      "permanentlyClosed",
      SAMPLE_NOW,
    ).entity;
    const suspended = Place.suspend(place, LATER);
    expect(Place.isSuspended(suspended.entity)).toBe(true);
    expect(suspended.entity.profile).toBe(place.profile);
    expect(suspended.entity.operatingStatus).toBe("permanentlyClosed");
    expect(suspended.entity.version).toBe(place.version + 1);
    expect(suspended.eventDrafts.map((d) => d.type)).toEqual([
      "place.suspended",
    ]);
    const lifted = Place.unsuspend(suspended.entity, LATER);
    expect(Place.isSuspended(lifted.entity)).toBe(false);
    expect(lifted.eventDrafts).toEqual([
      {
        type: "place.unsuspended",
        payload: { placeId: place.id },
        occurredAt: LATER,
        aggregateId: place.id,
      },
    ]);
  });

  it("refuses a repeated suspension or lift", () => {
    const suspended = Place.suspend(samplePlace(), LATER).entity;
    expectBusinessError(
      () => Place.suspend(suspended, LATER),
      "PLACE_ALREADY_SUSPENDED",
    );
    expectBusinessError(
      () => Place.unsuspend(samplePlace(), LATER),
      "PLACE_NOT_SUSPENDED",
    );
  });
});

describe("Place.takeDownPhotos", () => {
  it("removes the photos, keeps the order and stays published", () => {
    const place = samplePlace(samplePlaceId(1), {
      photoIds: [ph(1), ph(2), ph(3)],
    });
    const { entity, eventDrafts } = Place.takeDownPhotos(
      place,
      [ph(1), ph(3)],
      LATER,
    );
    expect(photoIdsOf(entity)).toEqual([ph(2)]);
    expect(entity.profile.photos.takenDown).toBe(true);
    expect(Place.isSuspended(entity)).toBe(false);
    expect(eventDrafts).toEqual([
      {
        type: "content.photos_taken_down",
        payload: {
          owner: { kind: "place", id: place.id },
          photoIds: [ph(1), ph(3)],
          unpublished: false,
        },
        occurredAt: LATER,
        aggregateId: place.id,
      },
      {
        type: "photos.released",
        payload: { photoIds: [ph(1), ph(3)] },
        occurredAt: LATER,
        aggregateId: place.id,
      },
    ]);
  });

  it("removes nothing when a photo is not the place's", () => {
    const place = samplePlace(samplePlaceId(1), { photoIds: [ph(1)] });
    expectBusinessError(
      () => Place.takeDownPhotos(place, [ph(1), ph(9)], LATER),
      "PLACE_PHOTO_NOT_FOUND",
    );
  });
});

describe("Place.applyRevision", () => {
  it("applies only the revised items and emits status and released photos", () => {
    const place = samplePlace(samplePlaceId(1), {
      photoIds: [ph(1), ph(2)],
      description: "紹介",
    });
    const desired = {
      profile: sampleProfile({
        name: "川辺食堂",
        photoIds: [ph(3), ph(2)],
        description: "紹介",
      }),
      operatingStatus: "temporarilyClosed" as const,
    };
    const revision = PlaceRevision.between(place, desired);
    expect(FieldPatch.fields(revision)).toEqual([
      "name",
      "photos",
      "operatingStatus",
    ]);
    expect(FieldPatch.addedPhotoIds(PlaceRevision.schema, revision)).toEqual([
      ph(3),
    ]);
    const changedMeanwhile = Place.updateProfile(
      place,
      sampleProfile({
        photoIds: [ph(1), ph(2)],
        description: "新しい紹介",
      }),
      SAMPLE_NOW,
    ).entity;
    const { entity, eventDrafts } = Place.applyRevision(
      changedMeanwhile,
      revision,
      LATER,
    );
    expect(entity.profile.name).toBe("川辺食堂");
    expect(entity.profile.description).toBe("新しい紹介");
    expect(photoIdsOf(entity)).toEqual([ph(3), ph(2)]);
    expect(entity.operatingStatus).toBe("temporarilyClosed");
    expect(entity.version).toBe(changedMeanwhile.version + 1);
    expect(eventDrafts.map((d) => [d.type, d.payload])).toEqual([
      [
        "place.operating_status_changed",
        { placeId: place.id, from: "open", to: "temporarilyClosed" },
      ],
      ["photos.released", { photoIds: [ph(1)] }],
    ]);
  });

  it("changes only the status for a status-only revision", () => {
    const place = samplePlace();
    const revision = PlaceRevision.between(place, {
      profile: place.profile,
      operatingStatus: "permanentlyClosed",
    });
    const { entity } = Place.applyRevision(place, revision, LATER);
    expect(entity.profile).toEqual(place.profile);
    expect(entity.operatingStatus).toBe("permanentlyClosed");
  });

  it("returns the place as is when the revision no longer changes anything", () => {
    const place = samplePlace();
    const revision = PlaceRevision.between(place, {
      profile: sampleProfile({ address: SampleAddress.ginza() }),
      operatingStatus: "open",
    });
    const moved = Place.updateProfile(
      place,
      sampleProfile({ address: SampleAddress.ginza() }),
      SAMPLE_NOW,
    ).entity;
    const result = Place.applyRevision(moved, revision, LATER);
    expect(result.entity).toBe(moved);
    expect(result.eventDrafts).toEqual([]);
  });
});

describe("Place.snapshot / reconstruct", () => {
  it("round-trips", () => {
    const place = Place.suspend(
      Place.takeDownPhotos(
        samplePlace(samplePlaceId(1), {
          photoIds: [ph(1), ph(2)],
          description: "紹介",
          businessHours: "10-18",
          contact: "03",
        }),
        [ph(1)],
        LATER,
      ).entity,
      LATER,
    ).entity;
    expect(Place.reconstruct(Place.snapshot(place))).toEqual(place);
  });

  it("rejects stored values that break an invariant", () => {
    const snapshot = Place.snapshot(samplePlace());
    for (const broken of [
      { ...snapshot, name: " " },
      { ...snapshot, name: " 山田 " },
      { ...snapshot, operatingStatus: "closed" },
      { ...snapshot, photoIds: [ph(1), ph(1)] },
      { ...snapshot, location: { latitude: 100, longitude: 0 } },
      { ...snapshot, address: { ...snapshot.address, areaCode: "12" } },
      { ...snapshot, description: "" },
      { ...snapshot, version: -1 },
    ]) {
      expect(() => Place.reconstruct(broken)).toThrow(RehydrationError);
    }
  });
});
