import { LocalDate } from "@repo/core/domain/common/localDate";
import { ManualEnd } from "@repo/core/domain/listing/offering";
import {
  listingFactory,
  period,
  TODAY,
} from "@repo/core/domain/listing/testing/samples";
import { Place } from "@repo/core/domain/place/place";
import { samplePlace } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import type { ListingEntry } from "../entry";
import { Standing } from "../standing";
import { ViewProjection } from "../viewProjection";
import { VisibilityPolicy } from "../visibilityPolicy";

const f = listingFactory();
const place = (photos = 0): Place =>
  samplePlace(f.place(), {
    photoIds: Array.from({ length: photos }, () => f.photo().photoId),
  });

describe("VisibilityPolicy", () => {
  it("a place is viewable unless suspended", () => {
    const p = place();
    expect(VisibilityPolicy.isPlaceViewable(p)).toBe(true);
    expect(
      VisibilityPolicy.isPlaceViewable(Place.suspend(p, new Date()).entity),
    ).toBe(false);
  });

  it("a listing is viewable only when published, not suspended, at a viewable place", () => {
    const p = place();
    const suspendedPlace = Place.suspend(p, new Date()).entity;
    const published = f.published(p.id);
    expect(VisibilityPolicy.isListingViewable(published, p)).toBe(true);
    expect(VisibilityPolicy.isListingViewable(published, null)).toBe(false);
    expect(VisibilityPolicy.isListingViewable(published, suspendedPlace)).toBe(
      false,
    );
    expect(VisibilityPolicy.isListingViewable(f.draft(p.id), p)).toBe(false);
    expect(VisibilityPolicy.isListingViewable(f.unpublished(p.id), p)).toBe(
      false,
    );
    expect(VisibilityPolicy.isListingViewable(f.suspended(published), p)).toBe(
      false,
    );
  });

  it("the discovery scene admits available listings at places not permanently closed; reference admits all", () => {
    const open = place();
    const closed = Place.changeOperatingStatus(
      place(),
      "permanentlyClosed",
      new Date(),
    ).entity;
    const resting = Place.changeOperatingStatus(
      place(),
      "temporarilyClosed",
      new Date(),
    ).entity;
    const cases = [
      [Standing.ofListing(f.published(open.id), open, TODAY), true],
      [Standing.ofListing(f.published(resting.id), resting, TODAY), true],
      [Standing.ofListing(f.published(closed.id), closed, TODAY), false],
      [
        Standing.ofListing(
          f.published(open.id, { offering: period("2026-07-20", null) }),
          open,
          TODAY,
        ),
        false,
      ],
      [Standing.ofListing(f.manuallyEnded(open.id), open, TODAY), false],
      [Standing.ofPlace(open), true],
      [Standing.ofPlace(resting), true],
      [Standing.ofPlace(closed), false],
    ] as const;
    for (const [standing, discoverable] of cases) {
      expect(VisibilityPolicy.admits("discovery", standing)).toBe(discoverable);
      expect(VisibilityPolicy.admits("reference", standing)).toBe(true);
    }
  });
});

describe("ViewProjection", () => {
  it("substituteCover takes the newest viewable listing of a place without photos, any offering phase", () => {
    const p = place();
    const older = f.published(p.id);
    const newer = f.manuallyEnded(p.id);
    const hidden = f.unpublished(p.id);
    expect(ViewProjection.substituteCover(p, [older, newer, hidden])).toEqual({
      listingId: newer.id,
      photo: newer.content.photos.items[0],
    });
    expect(
      ViewProjection.substituteCover(p, [hidden, f.draft(p.id)]),
    ).toBeNull();
    const withPhoto = place(1);
    expect(
      ViewProjection.substituteCover(withPhoto, [f.published(withPhoto.id)]),
    ).toBeNull();
    expect(
      ViewProjection.substituteCover(Place.suspend(p, new Date()).entity, [
        older,
      ]),
    ).toBeNull();
  });

  it("placeSummary covers with the place's own photo, else the substitute, else none", () => {
    const own = place(1);
    expect(
      ViewProjection.placeSummary(
        ViewProjection.placeEntry(own, null, [], []),
        {
          kind: "displayed",
        },
      ).cover,
    ).toEqual({
      source: "own",
      photoId: own.profile.photos.items[0]?.photoId,
      framing: null,
    });
    const bare = place();
    expect(
      ViewProjection.placeSummary(
        ViewProjection.placeEntry(bare, null, [], []),
        {
          kind: "displayed",
        },
      ).cover,
    ).toBeNull();
  });

  it("pickOtherListings drops self from the same place, appends the region's, and cuts to the limit", () => {
    const p = place();
    const entry = ViewProjection.placeEntry(p, null, [], []);
    const entries: ListingEntry[] = Array.from({ length: 4 }, () => ({
      listing: f.published(p.id),
      place: entry,
    }));
    const [a, b, c, d] = entries;
    if (!a || !b || !c || !d) throw new Error("entries");
    expect(
      ViewProjection.pickOtherListings(a.listing.id, [a, b], [c, d], 2),
    ).toEqual([b, c]);
  });

  it("previewListing projects incomplete content with its standing", () => {
    const p = place();
    const content = f.content({ name: null, photos: 0, categoryId: null });
    const preview = ViewProjection.previewListing(
      {
        content,
        manualEnd: ManualEnd.ended(),
        place: p,
        affiliations: null,
        regions: [],
      },
      LocalDate.parse("2026-07-10"),
    );
    expect(preview.summary).toEqual({
      placeId: p.id,
      cover: null,
      listingName: null,
      placeName: p.profile.name,
      region: null,
      standing: {
        kind: "listing",
        offering: { phase: "ended", cause: "manual", scheduleElapsed: false },
        operating: "open",
      },
    });
    expect(preview.detail.place.placeId).toBe(p.id);
  });
});
