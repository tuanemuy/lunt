import { EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotosReleasedEvent } from "@repo/core/domain/common/photoEvents";
import { ContentRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { SystemError } from "../../errors";
import { photoEventDecoders } from "../eventDecoders";

const decode = photoEventDecoders["photos.released"];
const meta = {
  id: EventId.create("event-1"),
  occurredAt: new Date("2026-09-28T00:00:00.000Z"),
  aggregateId: "listing-1",
};

function failure(payload: unknown): unknown {
  try {
    decode(payload as Record<string, unknown>, meta);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("photoEventDecoders", () => {
  it("decodes a stored photos.released draft back into the event", () => {
    const draft = PhotosReleasedEvent.draft(
      ContentRef.create("listing", "listing-1"),
      [PhotoId.create("p1"), PhotoId.create("p2")],
      meta.occurredAt,
    );
    const stored = JSON.parse(JSON.stringify(draft.payload)) as Record<
      string,
      unknown
    >;
    expect(decode(stored, meta)).toEqual({ ...draft, id: meta.id });
  });

  it.each([
    ["an extra key", { photoIds: [], extra: 1 }],
    ["a missing list", {}],
    ["a non-string id", { photoIds: [1] }],
    ["a blank id", { photoIds: [" "] }],
  ])("refuses %s as a data-integrity failure", (_, payload) => {
    expect(failure(payload)).toBeInstanceOf(SystemError);
  });
});
