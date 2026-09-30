import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  consumers,
  EveryEventSubscribed,
  UnsubscribedEventType,
  UnsubscribedEventTypeOf,
} from "../consumers";

type WithoutDiscardReleasedPhotos = Omit<
  typeof consumers,
  "discardReleasedPhotos"
>;

describe("consumer ledger coverage", () => {
  it("leaves no event type without a registered consumer", () => {
    expectTypeOf<UnsubscribedEventType>().toEqualTypeOf<never>();
    expectTypeOf<
      EveryEventSubscribed<typeof consumers>
    >().toEqualTypeOf<true>();
  });

  it("names the event type a ledger missing its only consumer leaves unsubscribed", () => {
    expectTypeOf<
      UnsubscribedEventTypeOf<WithoutDiscardReleasedPhotos>
    >().toEqualTypeOf<"photos.released">();
  });

  it("refuses to compile a ledger missing an event type's consumer", () => {
    // @ts-expect-error photos.released has no consumer without discardReleasedPhotos
    const incomplete: EveryEventSubscribed<WithoutDiscardReleasedPhotos> = true;
    // @ts-expect-error an empty ledger leaves every event type unsubscribed
    const empty: EveryEventSubscribed<Record<never, never>> = true;
    expect([incomplete, empty]).toEqual([true, true]);
  });
});
