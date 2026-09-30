import { Address } from "@repo/core/domain/common/address";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { RegionId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { isRehydrationError } from "@repo/core/domain/error";
import {
  SampleAddress,
  samplePhotoId,
} from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { RegionContent, type RegionContentInput } from "../content";
import { type PublishedRegion, Region, type RegionSnapshot } from "../region";

const t0 = new Date("2026-09-01T00:00:00.000Z");
const t1 = new Date("2026-09-02T00:00:00.000Z");
const t2 = new Date("2026-09-03T00:00:00.000Z");
const id = RegionId.create("region-1");
const photo = samplePhotoId;

const input = (over: Partial<RegionContentInput> = {}): RegionContentInput => ({
  name: "谷中",
  address: SampleAddress.otemachi(),
  location: GeoPoint.create(35.72, 139.76),
  photoIds: [photo(1), photo(2)],
  description: "下町の路地",
  tagline: "路地を歩く",
  ...over,
});

const content = (over: Partial<RegionContentInput> = {}) =>
  RegionContent.create(input(over));

const draft = (over: Partial<RegionContentInput> = {}) =>
  Region.register({ id, content: content(over) }, t0).entity;

const published = (over: Partial<RegionContentInput> = {}): PublishedRegion =>
  Region.publish(draft(over), t0).entity;

const suspended = <R extends Region>(region: R): Region =>
  Region.suspend(region, t0).entity;

describe("Region.register", () => {
  it("makes a draft, not suspended, at version 0, without events", () => {
    const { entity, eventDrafts } = Region.register(
      { id, content: content({ photoIds: [], location: null }) },
      t0,
    );
    expect(entity).toMatchObject({
      id,
      publication: { status: "draft" },
      suspension: { suspended: false },
      version: 0,
      updatedAt: t0,
    });
    expect(eventDrafts).toEqual([]);
  });
});

describe("Region.updateContent", () => {
  it("replaces the content, bumps the version and releases dropped photos", () => {
    const region = published();
    const { entity, eventDrafts } = Region.updateContent(
      region,
      content({ name: "根津", photoIds: [photo(3), photo(1)] }),
      t1,
    );
    expect(entity.publication).toEqual(region.publication);
    expect(entity.content.name).toBe("根津");
    expect(PhotoSet.photoIds(entity.content.photos)).toEqual([
      photo(3),
      photo(1),
    ]);
    expect(entity).toMatchObject({ version: 2, updatedAt: t1 });
    expect(eventDrafts).toEqual([
      {
        type: "photos.released",
        payload: { photoIds: [photo(2)] },
        occurredAt: t1,
        aggregateId: id,
      },
    ]);
  });

  it("refuses to save a published region without its requirements", () => {
    const region = published();
    const error = catchError(() =>
      Region.updateContent(
        region,
        content({ name: null, location: null, photoIds: [] }),
        t1,
      ),
    );
    expect(error).toMatchObject({
      code: "REGION_PUBLISH_CONDITION_UNMET",
      missing: ["name", "location", "photos"],
    });
  });

  it("saves incomplete content of a draft or unpublished region, keeping the state", () => {
    const empty = content({
      name: null,
      address: null,
      location: null,
      photoIds: [],
    });
    const fromDraft = Region.updateContent(draft(), empty, t1).entity;
    expect(fromDraft.publication.status).toBe("draft");
    const unpublished = Region.unpublish(published(), t0).entity;
    const fromUnpublished = Region.updateContent(unpublished, empty, t1).entity;
    expect(fromUnpublished.publication).toEqual(unpublished.publication);
    expect(Region.missingRequirements(fromUnpublished.content)).toEqual([
      "name",
      "address",
      "location",
      "photos",
    ]);
  });

  it("works while suspended and keeps the suspension", () => {
    const region = suspended(published());
    const { entity } = Region.updateContent(
      region,
      content({ description: "新しい紹介" }),
      t1,
    );
    expect(entity.suspension.suspended).toBe(true);
    expect(entity.publication.status).toBe("published");
    expect(entity.content.description).toBe("新しい紹介");
  });

  it("returns the same region for equal content, without a version bump or events", () => {
    const region = published();
    const result = Region.updateContent(region, content(), t1);
    expect(result.entity).toBe(region);
    expect(result.eventDrafts).toEqual([]);
  });

  it("keeps takenDown while the photo order is unchanged and clears it on a change", () => {
    const region = Region.takeDownPhotos(
      published({ photoIds: [photo(1), photo(2), photo(3)] }),
      [photo(1)],
      t1,
    ).entity;
    expect(region.content.photos.takenDown).toBe(true);
    const kept = Region.updateContent(
      region,
      content({ photoIds: [photo(2), photo(3)], description: "変更" }),
      t2,
    ).entity;
    expect(kept.content.photos.takenDown).toBe(true);
    expect(kept.version).toBe(region.version + 1);
    const same = Region.updateContent(
      region,
      content({ photoIds: [photo(2), photo(3)] }),
      t2,
    );
    expect(same.entity).toBe(region);
    const cleared = Region.updateContent(
      region,
      content({ photoIds: [photo(2), photo(3), photo(4)] }),
      t2,
    ).entity;
    expect(cleared.content.photos.takenDown).toBe(false);
  });
});

describe("Region.publish", () => {
  it("publishes a complete draft at now, without events", () => {
    const { entity, eventDrafts } = Region.publish(draft(), t1);
    expect(entity.publication).toEqual({
      status: "published",
      firstPublishedAt: t1,
    });
    expect(entity).toMatchObject({ version: 1, updatedAt: t1 });
    expect(eventDrafts).toEqual([]);
  });

  it("keeps firstPublishedAt when re-publishing", () => {
    const unpublished = Region.unpublish(published(), t1).entity;
    const republished = Region.publish(unpublished, t2).entity;
    expect(republished.publication).toEqual({
      status: "published",
      firstPublishedAt: t0,
    });
  });

  it("names the missing requirements in order", () => {
    const error = catchError(() =>
      Region.publish(draft({ location: null, photoIds: [] }), t1),
    );
    expect(error).toMatchObject({
      code: "REGION_PUBLISH_CONDITION_UNMET",
      missing: ["location", "photos"],
    });
  });

  it("checks suspension first, then the transition, then the requirements", () => {
    expectBusinessError(
      () => Region.publish(suspended(draft({ photoIds: [] })), t1),
      "REGION_SUSPENDED",
    );
    expectBusinessError(
      () => Region.publish(suspended(published()), t1),
      "REGION_SUSPENDED",
    );
    expectBusinessError(
      () => Region.publish(published(), t1),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });
});

describe("Region.unpublish", () => {
  it("unpublishes by the manager and emits region.unpublished", () => {
    const { entity, eventDrafts } = Region.unpublish(published(), t1);
    expect(entity.publication).toEqual({
      status: "unpublished",
      firstPublishedAt: t0,
      reason: "byManager",
    });
    expect(entity.version).toBe(2);
    expect(eventDrafts).toEqual([
      {
        type: "region.unpublished",
        payload: { regionId: id, reason: "byManager" },
        occurredAt: t1,
        aggregateId: id,
      },
    ]);
  });

  it("refuses while suspended before the transition, and anything not published", () => {
    const unpublished = Region.unpublish(published(), t1).entity;
    expectBusinessError(
      () => Region.unpublish(suspended(unpublished), t2),
      "REGION_SUSPENDED",
    );
    expectBusinessError(
      () => Region.unpublish(suspended(published()), t2),
      "REGION_SUSPENDED",
    );
    expectBusinessError(
      () => Region.unpublish(unpublished, t2),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expectBusinessError(
      () => Region.unpublish(draft(), t2),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });
});

describe("Region.suspend / unsuspend", () => {
  it("toggles the suspension keeping the publication, with events", () => {
    const region = published();
    const s = Region.suspend(region, t1);
    expect(s.entity.suspension.suspended).toBe(true);
    expect(s.entity.publication).toEqual(region.publication);
    expect(s.entity.version).toBe(region.version + 1);
    expect(s.eventDrafts).toEqual([
      {
        type: "region.suspended",
        payload: { regionId: id },
        occurredAt: t1,
        aggregateId: id,
      },
    ]);
    const u = Region.unsuspend(s.entity, t2);
    expect(u.entity.suspension.suspended).toBe(false);
    expect(u.entity.publication).toEqual(region.publication);
    expect(u.eventDrafts).toEqual([
      {
        type: "region.unsuspended",
        payload: { regionId: id },
        occurredAt: t2,
        aggregateId: id,
      },
    ]);
  });

  it("works on a draft too", () => {
    const s = Region.suspend(draft(), t1).entity;
    expect(s.publication.status).toBe("draft");
    expect(s.suspension.suspended).toBe(true);
  });

  it("refuses a repeated suspension and lifting none", () => {
    expectBusinessError(
      () => Region.suspend(suspended(draft()), t1),
      "REGION_ALREADY_SUSPENDED",
    );
    expectBusinessError(
      () => Region.unsuspend(draft(), t1),
      "REGION_NOT_SUSPENDED",
    );
  });
});

describe("Region.takeDownPhotos", () => {
  it("removes the photos, marks takenDown and emits taken-down and released", () => {
    const region = published({ photoIds: [photo(1), photo(2), photo(3)] });
    const { entity, eventDrafts } = Region.takeDownPhotos(
      region,
      [photo(1)],
      t1,
    );
    expect(entity.publication.status).toBe("published");
    expect(PhotoSet.photoIds(entity.content.photos)).toEqual([
      photo(2),
      photo(3),
    ]);
    expect(entity.content.photos.takenDown).toBe(true);
    expect(entity.version).toBe(region.version + 1);
    expect(eventDrafts).toEqual([
      {
        type: "content.photos_taken_down",
        payload: {
          owner: { kind: "region", id },
          photoIds: [photo(1)],
          unpublished: false,
        },
        occurredAt: t1,
        aggregateId: id,
      },
      {
        type: "photos.released",
        payload: { photoIds: [photo(1)] },
        occurredAt: t1,
        aggregateId: id,
      },
    ]);
  });

  it("unpublishes a published region left without photos (photoTakedown)", () => {
    const region = published({ photoIds: [photo(1)] });
    const { entity, eventDrafts } = Region.takeDownPhotos(
      region,
      [photo(1)],
      t1,
    );
    expect(entity.publication).toEqual({
      status: "unpublished",
      firstPublishedAt: t0,
      reason: "photoTakedown",
    });
    expect(eventDrafts.map((d) => d.type)).toEqual([
      "content.photos_taken_down",
      "region.unpublished",
      "photos.released",
    ]);
    expect(eventDrafts[0]?.payload).toMatchObject({ unpublished: true });
    expect(eventDrafts[1]?.payload).toEqual({
      regionId: id,
      reason: "photoTakedown",
    });
  });

  it("unpublishes also while suspended, keeping the suspension", () => {
    const { entity } = Region.takeDownPhotos(
      suspended(published({ photoIds: [photo(1)] })),
      [photo(1)],
      t1,
    );
    expect(entity.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(entity.suspension.suspended).toBe(true);
  });

  it("leaves a draft or unpublished region in its state", () => {
    const fromDraft = Region.takeDownPhotos(
      draft({ photoIds: [photo(1)] }),
      [photo(1)],
      t1,
    );
    expect(fromDraft.entity.publication.status).toBe("draft");
    expect(fromDraft.eventDrafts.map((d) => d.type)).toEqual([
      "content.photos_taken_down",
      "photos.released",
    ]);
    const unpublished = Region.unpublish(
      published({ photoIds: [photo(1)] }),
      t1,
    ).entity;
    const fromUnpublished = Region.takeDownPhotos(
      unpublished,
      [photo(1)],
      t2,
    ).entity;
    expect(fromUnpublished.publication).toEqual(unpublished.publication);
  });

  it("removes none and throws REGION_PHOTO_NOT_FOUND for a foreign photo", () => {
    expectBusinessError(
      () => Region.takeDownPhotos(published(), [photo(1), photo(9)], t1),
      "REGION_PHOTO_NOT_FOUND",
    );
  });
});

describe("Region.searchableText", () => {
  it("is the name, then tagline, description and address text", () => {
    expect(Region.searchableText(draft())).toEqual({
      primary: "谷中",
      secondary: [
        "路地を歩く",
        "下町の路地",
        Address.text(SampleAddress.otemachi()),
      ],
    });
  });

  it("omits absent values and reads an unnamed region as an empty name", () => {
    expect(
      Region.searchableText(
        draft({ name: null, tagline: null, address: null }),
      ),
    ).toEqual({ primary: "", secondary: ["下町の路地"] });
  });
});

describe("Region.reconstruct / snapshot", () => {
  const variants: readonly [string, Region][] = [
    [
      "draft",
      draft({ name: null, address: null, location: null, photoIds: [] }),
    ],
    ["published", published()],
    ["unpublished", Region.unpublish(published(), t1).entity],
    [
      "taken down",
      Region.takeDownPhotos(published({ photoIds: [photo(1)] }), [photo(1)], t1)
        .entity,
    ],
    ["suspended", suspended(published())],
  ];

  it.each(variants)("round-trips a %s region", (_, region) => {
    expect(Region.reconstruct(Region.snapshot(region))).toEqual(region);
  });

  const base = Region.snapshot(published());
  const broken = (
    over: (s: RegionSnapshot) => RegionSnapshot,
  ): RegionSnapshot => over(base);

  it.each([
    [
      "published without photos",
      broken((s) => ({ ...s, content: { ...s.content, photoIds: [] } })),
    ],
    [
      "draft with a publication date",
      broken((s) => ({
        ...s,
        publication: { status: "draft", firstPublishedAt: t0, reason: null },
      })),
    ],
    [
      "unknown reason",
      broken((s) => ({
        ...s,
        publication: {
          status: "unpublished",
          firstPublishedAt: t0,
          reason: "other",
        },
      })),
    ],
    [
      "published with a reason",
      broken((s) => ({
        ...s,
        publication: {
          status: "published",
          firstPublishedAt: t0,
          reason: "byManager",
        },
      })),
    ],
    [
      "unpublished without a date",
      broken((s) => ({
        ...s,
        publication: {
          status: "unpublished",
          firstPublishedAt: null,
          reason: "byManager",
        },
      })),
    ],
    [
      "untrimmed name",
      broken((s) => ({ ...s, content: { ...s.content, name: " 谷中" } })),
    ],
    [
      "duplicate photo",
      broken((s) => ({
        ...s,
        content: { ...s.content, photoIds: [photo(1), photo(1)] },
      })),
    ],
    ["negative version", broken((s) => ({ ...s, version: -1 }))],
    [
      "unknown status",
      broken((s) => ({
        ...s,
        publication: { status: "gone", firstPublishedAt: t0, reason: null },
      })),
    ],
  ] as const)("rejects %s", (_, snapshot) => {
    expect(
      isRehydrationError(catchError(() => Region.reconstruct(snapshot))),
    ).toBe(true);
  });

  it.each(LINE_BREAK_CASES)("rejects a stored name with %s", (_label, c) => {
    const snapshot = broken((s) => ({
      ...s,
      content: { ...s.content, name: `谷${c}中` },
    }));
    expect(
      isRehydrationError(catchError(() => Region.reconstruct(snapshot))),
    ).toBe(true);
  });
});
