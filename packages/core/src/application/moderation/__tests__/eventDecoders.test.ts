import { SystemError } from "@repo/core/application/errors";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import {
  InfoReportId,
  ListingId,
  PhotoId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import {
  type PhotosTakenDownEvent,
  PhotosTakenDownEvent as TakenDown,
} from "@repo/core/domain/common/photoEvents";
import {
  type ModerationEvent,
  ModerationEvents,
} from "@repo/core/domain/moderation/events";
import { describe, expect, it } from "vitest";
import {
  contentPhotoEventDecoders,
  moderationEventDecoders,
} from "../eventDecoders";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const id = (n: number) =>
  `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`;
const claimId = TakedownClaimId.create(id(1));
const reportId = InfoReportId.create(id(2));
const placeId = PlaceId.create(id(3));
const listingId = ListingId.create(id(4));

const drafts: readonly EventDraft<ModerationEvent>[] = [
  ModerationEvents.takedownClaimSubmitted(claimId, NOW),
  ModerationEvents.takedownClaimResolved(claimId, NOW),
  ModerationEvents.infoReportSubmitted(reportId, NOW),
  ModerationEvents.infoReportConfirmationRequested(
    reportId,
    { kind: "place", placeId },
    NOW,
  ),
  ModerationEvents.infoReportConfirmationRequested(
    reportId,
    { kind: "listing", placeId, listingId },
    NOW,
  ),
];

const meta = (draft: Readonly<{ occurredAt: Date; aggregateId: string }>) => ({
  id: EventId.create(id(99)),
  occurredAt: draft.occurredAt,
  aggregateId: draft.aggregateId,
});

describe("moderationEventDecoders", () => {
  it.each(drafts.map((draft) => [draft.type, draft] as const))(
    "decodes %s from its stored JSON payload",
    (_type, draft) => {
      const stored: unknown = JSON.parse(JSON.stringify(draft.payload));
      const decode = moderationEventDecoders[draft.type] as (
        payload: unknown,
        m: ReturnType<typeof meta>,
      ) => ModerationEvent;
      expect(decode(stored, meta(draft))).toEqual({
        ...draft,
        id: meta(draft).id,
      });
    },
  );

  it("treats an extra field, a blank id or an unknown target kind as corrupt data", () => {
    const [submitted, , , requested] = drafts;
    if (submitted === undefined || requested === undefined) {
      throw new Error("drafts");
    }
    expect(() =>
      moderationEventDecoders["takedown_claim.submitted"](
        { claimId, extra: true },
        meta(submitted),
      ),
    ).toThrow(SystemError);
    expect(() =>
      moderationEventDecoders["info_report.submitted"](
        { reportId: " " },
        meta(submitted),
      ),
    ).toThrow(SystemError);
    expect(() =>
      moderationEventDecoders["info_report.confirmation_requested"](
        { reportId, target: { kind: "region", placeId } },
        meta(requested),
      ),
    ).toThrow(SystemError);
  });
});

describe("contentPhotoEventDecoders", () => {
  const draft: EventDraft<PhotosTakenDownEvent> = TakenDown.draft(
    {
      owner: { kind: "listing", id: listingId },
      photoIds: [PhotoId.create(id(5)), PhotoId.create(id(6))],
      unpublished: true,
    },
    NOW,
  );

  it("decodes content.photos_taken_down from its stored JSON payload", () => {
    const stored: unknown = JSON.parse(JSON.stringify(draft.payload));
    expect(
      contentPhotoEventDecoders["content.photos_taken_down"](
        stored,
        meta(draft),
      ),
    ).toEqual({ ...draft, id: meta(draft).id });
  });

  it("treats an unknown owner kind as corrupt data", () => {
    expect(() =>
      contentPhotoEventDecoders["content.photos_taken_down"](
        {
          owner: { kind: "application", id: id(7) },
          photoIds: [],
          unpublished: false,
        },
        meta(draft),
      ),
    ).toThrow(SystemError);
  });
});
