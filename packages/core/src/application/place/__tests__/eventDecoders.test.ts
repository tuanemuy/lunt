import { SystemError } from "@repo/core/application/errors";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import { PlaceId } from "@repo/core/domain/common/ids";
import { type PlaceEvent, PlaceEvents } from "@repo/core/domain/place/events";
import { describe, expect, it } from "vitest";
import { placeEventDecoders } from "../eventDecoders";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const placeId = PlaceId.create("ffffffff-ffff-7fff-8fff-000000000001");

const drafts: readonly EventDraft<PlaceEvent>[] = [
  PlaceEvents.operatingStatusChanged(placeId, "open", "permanentlyClosed", NOW),
  PlaceEvents.suspended(placeId, NOW),
  PlaceEvents.unsuspended(placeId, NOW),
];

const meta = (draft: EventDraft<PlaceEvent>) => ({
  id: EventId.create("ffffffff-ffff-7fff-8fff-000000000099"),
  occurredAt: draft.occurredAt,
  aggregateId: draft.aggregateId,
});

describe("placeEventDecoders", () => {
  it.each(drafts.map((draft) => [draft.type, draft] as const))(
    "decodes %s from its stored JSON payload",
    (_type, draft) => {
      const stored: unknown = JSON.parse(JSON.stringify(draft.payload));
      const decode = placeEventDecoders[draft.type] as (
        payload: unknown,
        m: ReturnType<typeof meta>,
      ) => PlaceEvent;
      expect(decode(stored, meta(draft))).toEqual({
        ...draft,
        id: meta(draft).id,
      });
    },
  );

  it("treats an unknown status or an extra field as corrupt data", () => {
    const decode = placeEventDecoders["place.operating_status_changed"];
    expect(() =>
      decode(
        { placeId, from: "open", to: "closed" },
        meta(drafts[0] as EventDraft<PlaceEvent>),
      ),
    ).toThrow(SystemError);
    expect(() =>
      placeEventDecoders["place.suspended"](
        { placeId, extra: true },
        meta(drafts[1] as EventDraft<PlaceEvent>),
      ),
    ).toThrow(SystemError);
    expect(() =>
      placeEventDecoders["place.unsuspended"](
        { placeId: " " },
        meta(drafts[2] as EventDraft<PlaceEvent>),
      ),
    ).toThrow(SystemError);
  });
});
