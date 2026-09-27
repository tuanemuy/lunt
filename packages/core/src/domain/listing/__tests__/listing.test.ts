import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import {
  CategoryId,
  ListingId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import { CategoryCatalog } from "../categoryCatalog";
import { ListingContent, type ListingContentInput } from "../content";
import { Listing, type PublishedListing } from "../listing";
import { ListingMatching } from "../listingMatching";
import { OfferingWatch } from "../offeringWatch";
import { ListingPatch } from "../patch";
import { CategoryName } from "../values";

const now = new Date("2026-07-10T03:00:00.000Z");
const today = LocalDate.fromInstant(now);
const [EAT, SEE] = [CategoryId.create("c1"), CategoryId.create("c2")];
const catalog = CategoryCatalog.establish(
  CategoryCatalog.empty(),
  [
    { id: EAT, name: CategoryName.create("食べる") },
    { id: SEE, name: CategoryName.create("見る") },
  ],
  now,
).entity;
const place = PlaceId.create("place-1");
const photo = (n: number) => PhotoId.create(`photo-${n}`);

const input = (
  over: Partial<ListingContentInput> = {},
): ListingContentInput => ({
  name: "りんご飴",
  description: null,
  categoryId: EAT,
  photos: [{ photoId: photo(1), framing: null }],
  offering: { kind: "none" },
  ...over,
});

const draft = (over: Partial<ListingContentInput> = {}, id = "l1") =>
  Listing.createDraft(
    {
      id: ListingId.create(id),
      placeId: place,
      content: ListingContent.create(input(over)),
    },
    catalog,
    now,
  ).entity;

const published = (over: Partial<ListingContentInput> = {}): PublishedListing =>
  Listing.publish(draft(over), now).entity;

describe("ListingContent.create", () => {
  it("turns blank name and description into null and trims them", () => {
    const content = ListingContent.create(
      input({ name: "  ", description: "  説明  " }),
    );
    expect(content.name).toBeNull();
    expect(content.description).toBe("説明");
  });

  it("names what the publish condition misses, in order", () => {
    expect(
      ListingContent.missingForPublication(
        ListingContent.create(
          input({ name: null, categoryId: null, photos: [] }),
        ),
      ),
    ).toEqual(["photos", "name", "category"]);
  });

  it("refuses a framing outside the photo", () => {
    expectBusinessError(
      () =>
        ListingContent.create(
          input({
            photos: [
              {
                photoId: photo(1),
                framing: { x: 0.5, y: 0, width: 0.6, height: 1 },
              },
            ],
          }),
        ),
      "LISTING_INVALID_FRAMING",
    );
  });
});

describe("Listing", () => {
  it("publishes a draft, unpublishes and re-publishes keeping the first publication and the manual end", () => {
    const listing = published();
    const ended = Listing.endOffering(listing, now).entity;
    const later = new Date(now.getTime() + 60_000);
    const unpublished = Listing.unpublish(ended, later);
    expect(unpublished.eventDrafts.map((e) => e.type)).toEqual([
      "listing.unpublished",
    ]);
    const again = Listing.publish(unpublished.entity, later).entity;
    expect(again.publication.firstPublishedAt).toEqual(now);
    expect(again.manualEnd).toEqual({ ended: true });
  });

  it("takes down the last photo of a published listing into unpublished / photoTakedown, even suspended", () => {
    const listing = Listing.suspend(published(), now).entity;
    const { entity, eventDrafts } = Listing.takeDownPhotos(
      listing,
      [photo(1)],
      now,
    );
    expect(entity.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(entity.content.photos.takenDown).toBe(true);
    expect(eventDrafts.map((e) => [e.type, e.payload])).toEqual([
      [
        "content.photos_taken_down",
        {
          owner: { kind: "listing", id: "l1" },
          photoIds: [photo(1)],
          unpublished: true,
        },
      ],
      ["listing.unpublished", { listingId: "l1", reason: "photoTakedown" }],
      ["photos.released", { photoIds: [photo(1)] }],
    ]);
    expectBusinessError(
      () => Listing.takeDownPhotos(listing, [photo(9)], now),
      "LISTING_PHOTO_NOT_FOUND",
    );
  });

  it("applies a revision: overlays its fields, resolves the category, refuses one leaving no photo", () => {
    const retired = CategoryCatalog.retire(catalog, EAT, SEE, now).entity;
    const listing = published({
      photos: [
        { photoId: photo(1), framing: null },
        { photoId: photo(2), framing: null },
      ],
    });
    const proposed = ListingContent.toPublishable(
      ListingContent.create(
        input({
          name: "新しい名称",
          photos: [
            { photoId: photo(2), framing: null },
            { photoId: photo(3), framing: null },
          ],
        }),
      ),
    );
    const patch = ListingPatch.between(listing.content, proposed);
    expect(FieldPatch.fields(patch)).toEqual(["name", "photos"]);
    const { entity, eventDrafts } = Listing.applyPatch(
      listing,
      patch,
      retired,
      now,
    );
    expect(entity.content.name).toBe("新しい名称");
    expect(entity.content.categoryId).toBe(SEE);
    expect(PhotoSet.photoIds(entity.content.photos)).toEqual([
      photo(2),
      photo(3),
    ]);
    expect(eventDrafts.map((e) => e.payload)).toEqual([
      { photoIds: [photo(1)] },
    ]);

    const onlyCurrent = FieldPatch.create([
      {
        field: "photos" as const,
        value: [
          { photoId: photo(1), framing: null, origin: "current" as const },
        ],
      },
    ]);
    const withoutPhoto1 = Listing.update(
      listing,
      {
        ...listing.content,
        photos: PhotoSet.of([{ photoId: photo(2), framing: null }], "LISTING"),
      },
      catalog,
      now,
    ).entity;
    expectBusinessError(
      () => Listing.applyPatch(withoutPhoto1, onlyCurrent, catalog, now),
      "LISTING_PATCH_PHOTOS_UNAVAILABLE",
    );
  });

  it("tells a duplicate of a source: same place, texts, resolved category, framings, no offering", () => {
    const source = published({
      offering: { kind: "period", start: "2026-07-01", end: null },
    });
    const copy = Listing.duplicate(
      source,
      { id: ListingId.create("l2"), photoIds: new Map([[photo(1), photo(9)]]) },
      catalog,
      now,
    ).entity;
    expect(copy.content.offering).toEqual({ kind: "none" });
    expect(Listing.isDuplicateOf(copy, source, catalog)).toBe(true);
    const renamed = Listing.update(
      copy,
      {
        ...copy.content,
        name: ListingContent.create(input({ name: "別" })).name,
      },
      catalog,
      now,
    ).entity;
    expect(Listing.isDuplicateOf(renamed, source, catalog)).toBe(false);
    expectBusinessError(
      () =>
        Listing.duplicate(
          source,
          { id: ListingId.create("l3"), photoIds: new Map() },
          catalog,
          now,
        ),
      "LISTING_DUPLICATE_PHOTOS_MISMATCH",
    );
  });

  it("puts every listing in exactly one publication shelf", () => {
    const d = draft();
    const p = published();
    const u = Listing.unpublish(published(), now).entity;
    expect(
      [
        d,
        p,
        u,
        Listing.suspend(d, now).entity,
        Listing.suspend(p, now).entity,
      ].map(Listing.publicationShelf),
    ).toEqual(["draft", "published", "hidden", "hidden", "hidden"]);
    expect(
      Listing.inShelf(
        p,
        { publication: "published", phase: "available" },
        today,
      ),
    ).toBe(true);
    expect(
      Listing.inShelf(p, { publication: null, phase: "ended" }, today),
    ).toBe(false);
  });

  it("attaches only published, unsuspended listings of the place, in any offering phase", () => {
    const ok = published({
      offering: { kind: "period", start: null, end: "2026-06-30" },
    });
    const suspended = Listing.suspend(published(), now).entity;
    const other = Listing.createDraft(
      {
        id: ListingId.create("l9"),
        placeId: PlaceId.create("place-2"),
        content: ListingContent.create(input()),
      },
      catalog,
      now,
    ).entity;
    expect(
      Listing.attachableIds([ok, suspended, draft(), other], place, today),
    ).toEqual([ok.id]);
  });

  it("round-trips every state through snapshot / reconstruct and refuses a published listing lacking the condition", () => {
    const states = [
      draft(),
      published({
        offering: { kind: "dates", dates: ["2026-07-20", "2026-07-27"] },
      }),
      Listing.unpublish(published(), now).entity,
      Listing.suspend(Listing.endOffering(published(), now).entity, now).entity,
    ];
    for (const listing of states) {
      expect(Listing.reconstruct(Listing.snapshot(listing))).toEqual(listing);
    }
    const snapshot = Listing.snapshot(published());
    const broken = {
      ...snapshot,
      content: { ...snapshot.content, name: null },
    };
    expect(
      isRehydrationError(catchError(() => Listing.reconstruct(broken))),
    ).toBe(true);
  });
});

describe("ListingMatching", () => {
  it("matches the name as primary and the description as secondary", () => {
    expect(
      ListingMatching.searchableText(
        draft({ name: "りんご", description: "甘い" }),
      ),
    ).toEqual({ primary: "りんご", secondary: ["甘い"] });
    expect(
      ListingMatching.searchableText(draft({ name: null, description: null })),
    ).toEqual({ primary: "", secondary: [] });
  });
});

describe("OfferingWatch.detect", () => {
  it("emits listing.offering_ended only when the phase turns ended", () => {
    const listing = published({
      offering: { kind: "period", start: null, end: "2026-07-09" },
    });
    const first = OfferingWatch.detect(listing, "available", today, now);
    expect(first.record).toEqual({
      listingId: listing.id,
      phase: "ended",
      observedVersion: listing.version,
      nextChangeOn: null,
    });
    expect(first.eventDrafts.map((e) => e.payload)).toEqual([
      { listingId: listing.id, observedOn: "2026-07-10" },
    ]);
    expect(
      OfferingWatch.detect(listing, "ended", today, now).eventDrafts,
    ).toEqual([]);
    expect(
      OfferingWatch.detect(published(), null, today, now).eventDrafts,
    ).toEqual([]);
  });
});
