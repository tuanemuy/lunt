import { DateRange } from "@repo/core/domain/common/dateRange";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { OccasionContent } from "../content";
import { Cancellation, HoldingStatus } from "../holdingStatus";
import { HoldingStatusObserver } from "../holdingStatusObserver";
import { Occasion } from "../occasion";
import { day, occasionFactory, SAMPLE_LOCATION } from "../testing/samples";
import { OccasionDescription, OccasionName } from "../values";

const period = DateRange.create(day("2026-10-01"), day("2026-10-03"));

describe("HoldingStatus", () => {
  it.each([
    ["2026-09-30", "upcoming", "2026-10-01"],
    ["2026-10-01", "ongoing", "2026-10-04"],
    ["2026-10-03", "ongoing", "2026-10-04"],
    ["2026-10-04", "ended", null],
  ] as const)("on %s is %s, next change %s", (today, status, next) => {
    expect(HoldingStatus.of(period, Cancellation.none, day(today))).toBe(
      status,
    );
    expect(
      HoldingStatus.nextChangeOn(period, Cancellation.none, day(today)),
    ).toBe(next);
  });

  it("never changes again for an ongoing occasion ending on the last representable day", () => {
    const endless = DateRange.create(day("2026-10-01"), day("9999-12-31"));
    expect(
      HoldingStatus.nextChangeOn(endless, Cancellation.none, day("2026-10-02")),
    ).toBeNull();
  });

  it("is cancelled whatever the date, and undetermined without a period", () => {
    expect(
      HoldingStatus.of(period, Cancellation.cancelled, day("2026-10-02")),
    ).toBe("cancelled");
    expect(
      HoldingStatus.nextChangeOn(
        period,
        Cancellation.cancelled,
        day("2026-09-01"),
      ),
    ).toBeNull();
    expect(HoldingStatus.of(null, Cancellation.none, day("2026-10-02"))).toBe(
      null,
    );
  });
});

describe("values", () => {
  it("trims names and refuses blank, over-long or multi-line ones", () => {
    expect(OccasionName.create("  秋の市  ")).toBe("秋の市");
    for (const bad of ["  ", "あ".repeat(101), "一行目\n二行目"]) {
      expect(() => OccasionName.create(bad)).toThrow(
        expect.objectContaining({ code: "OCCASION_INVALID_NAME" }),
      );
    }
    expect(OccasionName.create("あ".repeat(100))).toHaveLength(100);
  });

  it("allows line breaks in a description of up to 2000 characters", () => {
    expect(OccasionDescription.create("一行目\n二行目")).toBe("一行目\n二行目");
    expect(() => OccasionDescription.create("あ".repeat(2001))).toThrow(
      expect.objectContaining({ code: "OCCASION_INVALID_DESCRIPTION" }),
    );
  });
});

describe("OccasionContent", () => {
  const f = occasionFactory();

  it("lists missing requirements in name, period, venue, photos order", () => {
    expect(OccasionContent.missingRequirements(f.bare())).toEqual([
      "name",
      "period",
      "venue",
      "photos",
    ]);
    expect(
      OccasionContent.missingRequirements(
        f.content({ location: null, photos: 0 }),
      ),
    ).toEqual(["venue", "photos"]);
    expect(OccasionContent.missingRequirements(f.content())).toEqual([]);
  });

  it("reads blank strings as not entered and refuses an inverted period or a repeated photo", () => {
    const photo = f.photo();
    const input = {
      name: "  ",
      period: null,
      venue: { address: null, location: null },
      photoIds: [],
      description: "",
      tagline: " ",
    };
    expect(OccasionContent.create(input)).toMatchObject({
      name: null,
      description: null,
      tagline: null,
    });
    expect(() =>
      OccasionContent.create({
        ...input,
        period: { start: day("2026-10-03"), end: day("2026-10-01") },
      }),
    ).toThrow(expect.objectContaining({ code: "COMMON_INVALID_DATE_RANGE" }));
    expect(() =>
      OccasionContent.create({ ...input, photoIds: [photo, photo] }),
    ).toThrow(expect.objectContaining({ code: "OCCASION_DUPLICATE_PHOTO" }));
  });
});

describe("Occasion", () => {
  it("updates content: a new period emits period_changed, dropped photos are released, equal content changes nothing", () => {
    const f = occasionFactory();
    const [a, b] = [f.photo(), f.photo()];
    const occasion = f.published({ photos: [a, b] });
    const same = Occasion.updateContent(
      occasion,
      f.content({ photos: [a, b] }),
      f.tick(),
    );
    expect(same.entity).toBe(occasion);
    const moved = Occasion.updateContent(
      occasion,
      f.content({ photos: [b], period: ["2026-11-01", "2026-11-02"] }),
      f.tick(),
    );
    expect(moved.entity.version).toBe(occasion.version + 1);
    expect(moved.eventDrafts.map((e) => e.type)).toEqual([
      "occasion.period_changed",
      "photos.released",
    ]);
  });

  it("keeps the takedown marker while the photo order is unchanged", () => {
    const f = occasionFactory();
    const [a, b] = [f.photo(), f.photo()];
    const taken = Occasion.takeDownPhotos(
      f.published({ photos: [a, b] }),
      [a],
      f.tick(),
    ).entity;
    const kept = Occasion.updateContent(
      taken,
      f.content({ photos: [b], description: "紹介" }),
      f.tick(),
    ).entity;
    expect(kept.content.photos.takenDown).toBe(true);
    const reordered = Occasion.updateContent(
      taken,
      f.content({ photos: [b, f.photo()] }),
      f.tick(),
    ).entity;
    expect(reordered.content.photos.takenDown).toBe(false);
  });

  it("refuses publishing while suspended before an unmet requirement", () => {
    const f = occasionFactory();
    const suspended = f.suspended(f.bareDraft({ name: "名称" }));
    expect(() => Occasion.publish(suspended, f.tick())).toThrow(
      expect.objectContaining({ code: "OCCASION_SUSPENDED" }),
    );
  });

  it("cancels and revokes back and forth, each only from the other state", () => {
    const f = occasionFactory();
    const occasion = f.published();
    const cancelled = Occasion.cancel(occasion, f.tick());
    expect(cancelled.eventDrafts.map((e) => e.type)).toEqual([
      "occasion.cancelled",
    ]);
    expect(() => Occasion.cancel(cancelled.entity, f.tick())).toThrow(
      expect.objectContaining({ code: "OCCASION_ALREADY_CANCELLED" }),
    );
    const revoked = Occasion.revokeCancellation(cancelled.entity, f.tick());
    expect(revoked.entity.cancellation).toEqual({ cancelled: false });
    expect(() => Occasion.revokeCancellation(revoked.entity, f.tick())).toThrow(
      expect.objectContaining({ code: "OCCASION_NOT_CANCELLED" }),
    );
  });

  it("unpublishes a published occasion whose last photo is taken down, even while suspended", () => {
    const f = occasionFactory();
    const photo = f.photo();
    const occasion = f.suspended(f.published({ photos: [photo] }));
    const { entity, eventDrafts } = Occasion.takeDownPhotos(
      occasion,
      [photo],
      f.tick(),
    );
    expect(entity.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(eventDrafts.map((e) => e.type)).toEqual([
      "content.photos_taken_down",
      "occasion.unpublished",
      "photos.released",
    ]);
  });

  it("matches the name as primary and the tagline, description and address as secondary", () => {
    const f = occasionFactory();
    const occasion = f.draft({
      name: "秋の市",
      tagline: "キャッチ",
      description: "紹介",
      address: SampleAddress.ginza("2-2"),
    });
    expect(Occasion.searchableText(occasion)).toEqual({
      primary: "秋の市",
      secondary: ["キャッチ", "紹介", "東京都中央区銀座2-2"],
    });
    expect(Occasion.searchableText(f.bareDraft())).toEqual({
      primary: "",
      secondary: [],
    });
  });

  it("round-trips through its snapshot", () => {
    const f = occasionFactory();
    for (const occasion of [
      f.bareDraft({ name: "名前だけ" }),
      f.cancelled(f.suspended(f.published({ tagline: "コピー" }))),
      f.unpublished({ location: SAMPLE_LOCATION }),
    ]) {
      expect(Occasion.reconstruct(Occasion.snapshot(occasion))).toEqual(
        occasion,
      );
    }
  });

  it("refuses a stored published occasion lacking a requirement", () => {
    const f = occasionFactory();
    const snapshot = Occasion.snapshot(f.published());
    expect(() =>
      Occasion.reconstruct({
        ...snapshot,
        content: { ...snapshot.content, name: null },
      }),
    ).toThrow("Stored occasion violates invariants");
  });
});

describe("HoldingStatusObserver", () => {
  const f = occasionFactory();
  const occasion = f.published();
  const now = new Date("2026-10-04T03:00:00.000Z");

  it("emits occasion.ended once when the status turns ended", () => {
    const today = LocalDate.parse("2026-10-04");
    const first = HoldingStatusObserver.observe(null, occasion, today, now);
    expect(first.record).toEqual({
      occasionId: occasion.id,
      lastObserved: "ended",
      observedVersion: occasion.version,
      nextChangeOn: null,
    });
    expect(first.eventDrafts).toEqual([
      {
        type: "occasion.ended",
        payload: { occasionId: occasion.id, observedOn: "2026-10-04" },
        occurredAt: now,
        aggregateId: occasion.id,
      },
    ]);
    expect(
      HoldingStatusObserver.observe(first.record, occasion, today, now)
        .eventDrafts,
    ).toEqual([]);
  });

  it("emits nothing for an upcoming or cancelled occasion", () => {
    expect(
      HoldingStatusObserver.observe(null, occasion, day("2026-09-30"), now)
        .eventDrafts,
    ).toEqual([]);
    const cancelled = f.cancelled(occasion);
    expect(
      HoldingStatusObserver.observe(null, cancelled, day("2026-10-04"), now),
    ).toMatchObject({ record: { lastObserved: "cancelled" }, eventDrafts: [] });
  });
});
