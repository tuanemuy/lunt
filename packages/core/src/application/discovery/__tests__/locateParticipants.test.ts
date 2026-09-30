import { PERIODS } from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { OccasionId } from "@repo/core/domain/common/ids";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { describe, expect, it } from "vitest";
import {
  type LocateParticipantsInput,
  locateParticipants,
} from "../locateParticipants";
import { OCCASION_NOT_FOUND } from "../viewOccasion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const locate = (
  k: DiscoveryKit,
  occasionId: OccasionId,
  bounds: LocateParticipantsInput["bounds"] = null,
) =>
  locateParticipants({
    container: k.container,
    input: { occasionId, grid: { columns: 4, rows: 4 }, bounds },
  });

type Out = Awaited<ReturnType<typeof locate>>;

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

const bounds = (south: number, west: number, north: number, east: number) =>
  GeoBounds.create(GeoPoint.create(south, west), GeoPoint.create(north, east));

/** Every place id in the cells, by row, then column. */
const placeIdsOf = (out: Out) =>
  out.cells.flatMap((cell) =>
    cell.kind === "single"
      ? [cell.place.placeId]
      : cell.kind === "colocated"
        ? cell.places.map((place) => place.placeId)
        : [],
  );

async function participantAt(
  k: DiscoveryKit,
  occasionId: OccasionId,
  location: Readonly<{ latitude: number; longitude: number }>,
  spec: Readonly<{ status?: OperatingStatus; suspended?: boolean }> = {},
) {
  const place = await k.w.place({ ...spec, profile: { location } });
  await k.w.participate(occasionId, place.id);
  return place;
}

describe("locateParticipants", () => {
  it("locateParticipants#1 イベント E に、離れた位置の店舗 P・Q・S が参加中 / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await participantAt(k, E.id, at(35, 139));
    const Q = await participantAt(k, E.id, at(35.5, 139.5));
    const S = await participantAt(k, E.id, at(36, 140));
    const out = await locate(k, E.id);
    expect(out.cells.map((cell) => [cell.kind, cell.column, cell.row])).toEqual(
      [
        ["single", 0, 0],
        ["single", 2, 2],
        ["single", 3, 3],
      ],
    );
    expect(placeIdsOf(out)).toEqual([P.id, Q.id, S.id]);
    const [first] = out.cells;
    expect(first?.kind === "single" ? first.place.standing : null).toEqual({
      kind: "place",
      operating: "open",
    });
    expect(out.extent).toEqual(bounds(35, 139, 36, 140));
    expect(out.occasionName).toBe(E.content.name);
  });

  it("locateParticipants#2 イベント E の参加店舗 P・Q が近い位置にあり、同じ区画に入る。離れた位置に S / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    await participantAt(k, E.id, at(35, 139));
    await participantAt(k, E.id, at(35.001, 139.001));
    const S = await participantAt(k, E.id, at(36, 140));
    const out = await locate(k, E.id);
    expect(out.cells).toEqual([
      {
        kind: "cluster",
        column: 0,
        row: 0,
        count: 2,
        affiliatedCount: 0,
        extent: bounds(35, 139, 35.001, 139.001),
      },
      expect.objectContaining({ kind: "single", column: 3, row: 3 }),
    ]);
    expect(placeIdsOf(out)).toEqual([S.id]);
  });

  it("locateParticipants#3 上と同じ / 上のまとまりの範囲を範囲にして読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await participantAt(k, E.id, at(35, 139));
    const Q = await participantAt(k, E.id, at(35.001, 139.001));
    await participantAt(k, E.id, at(36, 140));
    const whole = await locate(k, E.id);
    const [cluster] = whole.cells;
    if (cluster?.kind !== "cluster") throw new Error("a cluster first");
    const zoomed = await locate(k, E.id, cluster.extent);
    expect(zoomed.cells.map((cell) => cell.kind)).toEqual(["single", "single"]);
    expect(placeIdsOf(zoomed)).toEqual([P.id, Q.id]);
    expect(zoomed.extent).toEqual(whole.extent);
  });

  it("locateParticipants#4 同じ位置の参加店舗 P・Q / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await participantAt(k, E.id, at(35, 139));
    const Q = await participantAt(k, E.id, at(35, 139));
    const out = await locate(k, E.id);
    expect(out.cells).toHaveLength(1);
    const [cell] = out.cells;
    expect(cell?.kind).toBe("colocated");
    if (cell?.kind !== "colocated") throw new Error("colocated");
    expect(cell.location).toEqual(GeoPoint.create(35, 139));
    expect(cell.places.map((place) => place.placeId).sort()).toEqual(
      [P.id, Q.id].sort(),
    );
  });

  it("locateParticipants#5 参加店舗に、休業中の店舗と閉店した店舗がある / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    await participantAt(k, E.id, at(35, 139), { status: "temporarilyClosed" });
    await participantAt(k, E.id, at(36, 140), { status: "permanentlyClosed" });
    const out = await locate(k, E.id);
    expect(
      out.cells.map((cell) =>
        cell.kind === "single" ? cell.place.standing.operating : null,
      ),
    ).toEqual(["temporarilyClosed", "permanentlyClosed"]);
  });

  it("locateParticipants#6 参加店舗に、非公開の店舗がある / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await participantAt(k, E.id, at(35, 139));
    const Q = await participantAt(k, E.id, at(35.5, 139.5));
    await participantAt(k, E.id, at(40, 145), { suspended: true });
    const out = await locate(k, E.id);
    expect(placeIdsOf(out)).toEqual([P.id, Q.id]);
    expect(out.extent).toEqual(bounds(35, 139, 35.5, 139.5));
  });

  it("locateParticipants#7 参加店舗に、写真のない店舗がある。その店舗に写真のある閲覧できる掲載がある / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await participantAt(k, E.id, at(35, 139));
    const L = await k.w.available(P.id);
    const [cell] = (await locate(k, E.id)).cells;
    expect(cell?.kind === "single" ? cell.place.cover : null).toEqual({
      source: "listing",
      listingId: L.id,
      photoId: L.content.photos.items[0]?.photoId,
      framing: L.content.photos.items[0]?.framing,
    });
  });

  it("locateParticipants#8 終了したイベント / そのイベントで読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({ period: PERIODS.ended });
    const P = await participantAt(k, E.id, at(35, 139));
    expect(placeIdsOf(await locate(k, E.id))).toEqual([P.id]);
  });

  it("locateParticipants#9 イベントに参加店舗がない / E で読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const out = await locate(k, E.id);
    expect(out.cells).toEqual([]);
    expect(out.extent).toBeNull();
  });

  it("locateParticipants#10 イベントが公開の取り下げ、運営による非公開、または存在しない / そのイベントで読む", async () => {
    const k = await discoveryKit();
    const ids = [
      (await k.w.occasion({ state: "unpublished" })).id,
      (await k.w.occasion({ state: "suspended" })).id,
      OccasionId.create(k.idGenerator.next()),
    ];
    for (const id of ids) {
      await expectNotFound(locate(k, id), OCCASION_NOT_FOUND);
    }
  });

  describe("the participants outside a requested range", () => {
    type Cell = Out["cells"][number];

    const countOf = (cells: readonly Cell[]) =>
      cells.reduce(
        (sum, cell) =>
          sum +
          (cell.kind === "single"
            ? 1
            : cell.kind === "colocated"
              ? cell.places.length
              : cell.count),
        0,
      );

    const idsOf = (cells: readonly Cell[]) =>
      cells.flatMap((cell) =>
        cell.kind === "single"
          ? [cell.place.placeId]
          : cell.kind === "colocated"
            ? cell.places.map((place) => place.placeId)
            : [],
      );

    it("locateParticipants 範囲なしで読む / 範囲の外の区画はない", async () => {
      const k = await discoveryKit();
      const E = await k.w.occasion();
      await participantAt(k, E.id, at(35, 139));
      await participantAt(k, E.id, at(34.7, 135.5));
      expect((await locate(k, E.id)).outside).toEqual([]);
    });

    it("locateParticipants 東京と大阪の参加店舗 / 範囲ごとに読むと、範囲の中と外で各店舗が1回ずつ", async () => {
      const k = await discoveryKit();
      const E = await k.w.occasion();
      const tokyo: Awaited<ReturnType<typeof participantAt>>[] = [];
      for (let i = 0; i < 6; i++) {
        tokyo.push(
          await participantAt(k, E.id, at(35.6 + i * 0.01, 139.7 + i * 0.01)),
        );
      }
      const osaka: Awaited<ReturnType<typeof participantAt>>[] = [];
      for (let i = 0; i < 3; i++) {
        osaka.push(
          await participantAt(k, E.id, at(34.6 + i * 0.01, 135.5 + i * 0.01)),
        );
      }
      const all = [...tokyo, ...osaka].map((place) => place.id).sort();
      const ranges = [
        // The Tokyo group whole, the Osaka group whole.
        { southWest: at(35.5, 139.6), northEast: at(35.7, 139.8) },
        { southWest: at(34.5, 135.4), northEast: at(34.7, 135.6) },
        // Straddling: half of the Tokyo group inside, half outside.
        { southWest: at(35.5, 139.6), northEast: at(35.625, 139.725) },
        // An edge through a place (inclusive: it counts inside).
        { southWest: at(35.62, 139.72), northEast: at(36, 140) },
        // Nothing inside.
        { southWest: at(40, 141), northEast: at(41, 142) },
      ];
      for (const range of ranges) {
        const out = await locateParticipants({
          container: k.container,
          input: {
            occasionId: E.id,
            grid: { columns: 64, rows: 64 },
            bounds: range,
          },
        });
        const inside = all.filter((id) => {
          const place = [...tokyo, ...osaka].find((each) => each.id === id);
          const { latitude, longitude } = place?.profile.location ?? at(0, 0);
          return (
            latitude >= range.southWest.latitude &&
            latitude <= range.northEast.latitude &&
            longitude >= range.southWest.longitude &&
            longitude <= range.northEast.longitude
          );
        });
        expect(idsOf(out.cells).sort()).toEqual(inside);
        expect(countOf(out.cells)).toBe(inside.length);
        expect(countOf(out.outside)).toBe(all.length - inside.length);
        expect(idsOf(out.outside).filter((id) => inside.includes(id))).toEqual(
          [],
        );
      }
    });

    it("locateParticipants 近い参加店舗がまとまる / まとまりの範囲や境界をまたぐ範囲で読むと、区画の件数の合計が参加店舗の数", async () => {
      const k = await discoveryKit();
      const E = await k.w.occasion();
      for (let i = 0; i < 20; i++) {
        await participantAt(
          k,
          E.id,
          at(35.6 + (i % 5) * 0.003, 139.7 + Math.floor(i / 5) * 0.003),
        );
      }
      for (let i = 0; i < 7; i++) {
        await participantAt(k, E.id, at(34.6 + i * 0.002, 135.5));
      }
      const whole = await locate(k, E.id);
      expect(countOf(whole.cells)).toBe(27);
      const clusters = whole.cells.filter((cell) => cell.kind === "cluster");
      expect(clusters.length).toBeGreaterThan(0);
      const ranges = [
        ...clusters.map((cell) => cell.extent),
        {
          southWest: at(35.605, 139.705),
          northEast: at(35.62, 139.72),
        },
        {
          southWest: at(34.6, 135.4),
          northEast: at(35.606, 139.706),
        },
      ];
      for (const range of ranges) {
        const out = await locate(k, E.id, range);
        expect(countOf(out.cells) + countOf(out.outside)).toBe(27);
        const ids = [...idsOf(out.cells), ...idsOf(out.outside)];
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
  });
});
