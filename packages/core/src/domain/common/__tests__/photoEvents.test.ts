import { attachEventIds, EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import {
  PhotosReleasedEvent,
  PhotosTakenDownEvent,
} from "@repo/core/domain/common/photoEvents";
import { ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";
import { describe, expect, expectTypeOf, it } from "vitest";

const now = new Date("2026-09-28T00:00:00Z");
const id = PhotoId.create;

describe("photos.released", () => {
  it("draft carries the photo ids, now, and the owner's id as aggregateId", () => {
    const owner = PhotoOwnerRef.create("application", "app-1");
    expect(PhotosReleasedEvent.draft(owner, [id("a"), id("b")], now)).toEqual({
      type: "photos.released",
      payload: { photoIds: ["a", "b"] },
      occurredAt: now,
      aggregateId: "app-1",
    });
  });

  it("draftsFor yields no draft when nothing was released", () => {
    const owner = ContentRef.create("listing", "l-1");
    expect(PhotosReleasedEvent.draftsFor(owner, [], now)).toEqual([]);
    expect(PhotosReleasedEvent.draftsFor(owner, [id("a")], now)).toHaveLength(
      1,
    );
  });

  it("lifts to a full event with attachEventIds", () => {
    const drafts = PhotosReleasedEvent.draftsFor(
      ContentRef.create("place", "p-1"),
      [id("a")],
      now,
    );
    const [event] = attachEventIds<PhotosReleasedEvent>(drafts, () =>
      EventId.create("e-1"),
    );
    expect(event?.id).toBe("e-1");
    expectTypeOf(PhotosReleasedEvent.type).toEqualTypeOf<"photos.released">();
  });
});

describe("content.photos_taken_down", () => {
  it("draft carries owner, photo ids and whether it unpublished; aggregateId is owner.id", () => {
    const owner = ContentRef.create("region", "r-1");
    expect(
      PhotosTakenDownEvent.draft(
        { owner, photoIds: [id("a")], unpublished: true },
        now,
      ),
    ).toEqual({
      type: "content.photos_taken_down",
      payload: { owner, photoIds: ["a"], unpublished: true },
      occurredAt: now,
      aggregateId: "r-1",
    });
    expectTypeOf(
      PhotosTakenDownEvent.type,
    ).toEqualTypeOf<"content.photos_taken_down">();
  });
});
