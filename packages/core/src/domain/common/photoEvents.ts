import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";

/**
 * A photo owner (aggregate or application) let go of these photos; Media
 * consumes it and deletes them. `aggregateId` is the owner's id.
 */
export type PhotosReleasedEvent = DomainEventBase<
  "photos.released",
  { photoIds: readonly PhotoId[] }
>;

/**
 * Photos were removed from `owner` on a takedown claim. `unpublished` is
 * whether the removal took the owner out of `published` (always `false` for
 * places, which have no publication state). `aggregateId` is `owner.id`.
 */
export type PhotosTakenDownEvent = DomainEventBase<
  "content.photos_taken_down",
  { owner: ContentRef; photoIds: readonly PhotoId[]; unpublished: boolean }
>;

const releasedDraft = (
  owner: PhotoOwnerRef,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): EventDraft<PhotosReleasedEvent> => ({
  type: "photos.released",
  payload: { photoIds },
  occurredAt: now,
  aggregateId: owner.id,
});

export const PhotosReleasedEvent = {
  type: "photos.released",

  draft: releasedDraft,

  /**
   * Zero or one draft: none when nothing was released, so callers can spread
   * the result into their event list without a branch.
   */
  draftsFor: (
    owner: PhotoOwnerRef,
    photoIds: readonly PhotoId[],
    now: Date,
  ): readonly EventDraft<PhotosReleasedEvent>[] => {
    const [first, ...rest] = photoIds;
    return first === undefined
      ? []
      : [releasedDraft(owner, [first, ...rest], now)];
  },
} as const;

export const PhotosTakenDownEvent = {
  type: "content.photos_taken_down",

  draft: (
    payload: Readonly<{
      owner: ContentRef;
      photoIds: readonly [PhotoId, ...PhotoId[]];
      unpublished: boolean;
    }>,
    now: Date,
  ): EventDraft<PhotosTakenDownEvent> => ({
    type: "content.photos_taken_down",
    payload: {
      owner: payload.owner,
      photoIds: payload.photoIds,
      unpublished: payload.unpublished,
    },
    occurredAt: now,
    aggregateId: payload.owner.id,
  }),
} as const;
