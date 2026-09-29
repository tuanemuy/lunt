import { DateRange } from "@repo/core/domain/common/dateRange";
import { describe, expect, it } from "vitest";
import { Participation, ParticipationDetails } from "../participation";
import { RegionLink } from "../regionLink";
import { day, occasionFactory } from "../testing/samples";

const period = DateRange.create(day("2026-10-01"), day("2026-10-03"));

describe("ParticipationDetails", () => {
  const f = occasionFactory();
  const [l1, l2] = [f.listing(), f.listing()];

  it("drops repeats, keeps the listing order and sorts the days", () => {
    expect(
      ParticipationDetails.create(
        {
          listingIds: [l2, l1, l2],
          dates: [day("2026-10-03"), day("2026-10-01"), day("2026-10-03")],
        },
        { period, attachableListingIds: new Set([l1, l2]) },
        null,
      ),
    ).toEqual({
      listingIds: [l2, l1],
      dates: [day("2026-10-01"), day("2026-10-03")],
    });
  });

  it("refuses a day outside the period, or any day without a period", () => {
    for (const facts of [
      { period, attachableListingIds: new Set([l1]) },
      { period: null, attachableListingIds: new Set([l1]) },
    ]) {
      expect(() =>
        ParticipationDetails.create(
          { listingIds: [], dates: [day("2026-10-04")] },
          facts,
          null,
        ),
      ).toThrow(
        expect.objectContaining({
          code: "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
        }),
      );
    }
  });

  it("keeps a listing already attached even when it is no longer attachable", () => {
    const current = { listingIds: [l1], dates: [] };
    const facts = { period, attachableListingIds: new Set<typeof l1>() };
    expect(
      ParticipationDetails.create(
        { listingIds: [l1], dates: [] },
        facts,
        current,
      ).listingIds,
    ).toEqual([l1]);
    expect(() =>
      ParticipationDetails.create(
        { listingIds: [l1, l2], dates: [] },
        facts,
        current,
      ),
    ).toThrow(
      expect.objectContaining({ code: "OCCASION_LISTING_NOT_ATTACHABLE" }),
    );
  });

  it("shows only the days within the current period", () => {
    const details = {
      listingIds: [],
      dates: [day("2026-10-01"), day("2026-10-05")],
    };
    expect(ParticipationDetails.datesWithin(details, period)).toEqual([
      day("2026-10-01"),
    ]);
    expect(ParticipationDetails.datesWithin(details, null)).toEqual([]);
  });
});

describe("Participation", () => {
  const f = occasionFactory();
  const key = { occasionId: f.occasionId(), placeId: f.place() };
  const details = { listingIds: [], dates: [] };

  it("adds directly only a viewable place without a steward, once", () => {
    const now = f.tick();
    const added = Participation.addDirectly(
      null,
      { key, details },
      { placeHasSteward: false, placeViewable: true },
      now,
    );
    expect(added.eventDrafts.map((e) => e.type)).toEqual([
      "occasion.participation_established",
    ]);
    expect(() =>
      Participation.addDirectly(
        added.entity,
        { key, details },
        { placeHasSteward: false, placeViewable: true },
        now,
      ),
    ).toThrow(
      expect.objectContaining({ code: "OCCASION_ALREADY_PARTICIPATING" }),
    );
    expect(() =>
      Participation.addDirectly(
        null,
        { key, details },
        { placeHasSteward: true, placeViewable: true },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: "OCCASION_PLACE_HAS_STEWARD" }));
    expect(() =>
      Participation.addDirectly(
        null,
        { key, details },
        { placeHasSteward: false, placeViewable: false },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: "OCCASION_PLACE_NOT_VIEWABLE" }));
  });

  it("changes nothing for equal details and tells who changed it otherwise", () => {
    const p = f.participation(key.occasionId, key.placeId);
    expect(Participation.changeByPlace(p, details, f.tick()).entity).toBe(p);
    const changed = Participation.changeByOccasion(
      p,
      { listingIds: [f.listing()], dates: [] },
      { placeHasSteward: false },
      f.tick(),
    );
    expect(changed.entity.version).toBe(p.version + 1);
    expect(changed.eventDrafts[0]?.payload).toMatchObject({
      changedBy: "occasion",
    });
    expect(Participation.withdraw(p, f.tick())[0]?.payload).toMatchObject({
      cause: "withdrawn",
    });
    expect(Participation.exclude(p, f.tick())[0]?.payload).toMatchObject({
      cause: "excluded",
    });
  });

  it("round-trips through its snapshot", () => {
    const p = f.participation(key.occasionId, key.placeId, {
      listingIds: [f.listing()],
      dates: [day("2026-10-02")],
    });
    expect(Participation.reconstruct(Participation.snapshot(p))).toEqual(p);
  });
});

describe("RegionLink", () => {
  const f = occasionFactory();
  const key = { occasionId: f.occasionId(), regionId: f.region() };

  it("links a viewable region, never over an existing pair", () => {
    const linked = f.regionLink(key.occasionId, key.regionId);
    expect(() =>
      RegionLink.link(linked, key, { regionViewable: true }, f.tick()),
    ).toThrow(
      expect.objectContaining({ code: "OCCASION_REGION_ALREADY_LINKED" }),
    );
    expect(() =>
      RegionLink.link(
        f.detached(linked),
        key,
        { regionViewable: true },
        f.tick(),
      ),
    ).toThrow(
      expect.objectContaining({ code: "OCCASION_REGION_LINK_DETACHED" }),
    );
    expect(() =>
      RegionLink.link(null, key, { regionViewable: false }, f.tick()),
    ).toThrow(
      expect.objectContaining({ code: "OCCASION_REGION_NOT_VIEWABLE" }),
    );
  });

  it("detaches and restores keeping linkedAt; unlinks only a linked pair", () => {
    const linked = f.regionLink(key.occasionId, key.regionId);
    const detached = RegionLink.detach(linked, f.tick());
    expect(detached.eventDrafts.map((e) => e.type)).toEqual([
      "occasion.region_link_detached",
    ]);
    expect(() => RegionLink.detach(detached.entity, f.tick())).toThrow(
      expect.objectContaining({
        code: "OCCASION_REGION_LINK_ALREADY_DETACHED",
      }),
    );
    expect(() => RegionLink.unlink(detached.entity)).toThrow(
      expect.objectContaining({ code: "OCCASION_REGION_LINK_DETACHED" }),
    );
    const restored = RegionLink.restore(detached.entity, f.tick()).entity;
    expect(restored).toMatchObject({
      status: "linked",
      linkedAt: linked.linkedAt,
    });
    expect(() => RegionLink.restore(restored, f.tick())).toThrow(
      expect.objectContaining({ code: "OCCASION_REGION_LINK_NOT_DETACHED" }),
    );
    expect(RegionLink.unlink(restored)).toEqual(key);
    expect(RegionLink.reconstruct(RegionLink.snapshot(restored))).toEqual(
      restored,
    );
  });
});
