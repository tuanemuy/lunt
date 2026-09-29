import {
  type EventId,
  EventId as EventIds,
} from "@repo/core/domain/common/event";
import { OccasionEvents } from "@repo/core/domain/occasion/events";
import {
  day,
  occasionFactory,
} from "@repo/core/domain/occasion/testing/samples";
import { describe, expect, it } from "vitest";
import { SystemError } from "../../errors";
import { occasionEventDecoders } from "../eventDecoders";

const f = occasionFactory();
const [occasionId, placeId, regionId] = [f.occasionId(), f.place(), f.region()];
const now = new Date("2026-10-04T03:00:00.000Z");
const id: EventId = EventIds.create("ffffffff-ffff-7fff-8fff-00000000abcd");

const drafts = [
  OccasionEvents.periodChanged(occasionId, now),
  OccasionEvents.unpublished(occasionId, "photoTakedown", now),
  OccasionEvents.cancelled(occasionId, now),
  OccasionEvents.ended(occasionId, day("2026-10-04"), now),
  OccasionEvents.suspended(occasionId, now),
  OccasionEvents.unsuspended(occasionId, now),
  OccasionEvents.participationEstablished(occasionId, placeId, now),
  OccasionEvents.participationChanged(occasionId, placeId, "place", now),
  OccasionEvents.participationDissolved(occasionId, placeId, "excluded", now),
  OccasionEvents.regionLinked(occasionId, regionId, now),
  OccasionEvents.regionLinkDetached(occasionId, regionId, now),
];

describe("occasionEventDecoders", () => {
  it.each(drafts.map((draft) => [draft.type, draft] as const))(
    "decodes %s as stored in the outbox",
    (_type, draft) => {
      const decode = occasionEventDecoders[draft.type] as (
        payload: unknown,
        meta: Readonly<{ id: EventId; occurredAt: Date; aggregateId: string }>,
      ) => unknown;
      const stored = JSON.parse(JSON.stringify(draft.payload)) as unknown;
      expect(
        decode(stored, {
          id,
          occurredAt: now,
          aggregateId: draft.aggregateId,
        }),
      ).toEqual({ ...draft, id });
    },
  );

  it("treats an extra or invalid field as corrupt data", () => {
    const meta = { id, occurredAt: now, aggregateId: occasionId };
    expect(() =>
      occasionEventDecoders["occasion.cancelled"](
        { occasionId, extra: 1 },
        meta,
      ),
    ).toThrow(SystemError);
    expect(() =>
      occasionEventDecoders["occasion.ended"](
        { occasionId, observedOn: "2026-13-01" },
        meta,
      ),
    ).toThrow(SystemError);
  });
});
