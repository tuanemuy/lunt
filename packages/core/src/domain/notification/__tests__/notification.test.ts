import { EventId } from "@repo/core/domain/common/event";
import { NotificationId } from "@repo/core/domain/common/ids";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { Notification } from "../notification";
import { OccurrenceKey } from "../occurrenceKey";
import { notificationIds, sampleOccurrences } from "../testing/samples";

const ids = notificationIds();
const now = new Date("2026-09-28T00:00:00.000Z");
const origin = { by: "event", eventId: EventId.create("event-1") } as const;

const snapshotOf = (n: Notification) => ({
  id: n.id,
  recipient: n.recipient,
  occurrenceKey: n.occurrenceKey,
  occurrence: JSON.parse(JSON.stringify(n.occurrence)) as unknown,
  delivery: n.delivery,
  createdAt: n.createdAt,
});

describe("Notification", () => {
  it("round-trips every occurrence through its stored form", () => {
    for (const { name, delivered } of sampleOccurrences(ids).samples) {
      const issued = Notification.issue(
        {
          id: NotificationId.create(ids.raw()),
          origin,
          delivered,
          recipient: ids.account(),
        },
        now,
      );
      expect(Notification.reconstruct(snapshotOf(issued)), name).toEqual(
        issued,
      );
    }
  });

  it("refuses a proxy delivery of an occurrence not addressed to stewards", () => {
    const issued = Notification.issue(
      {
        id: NotificationId.create(ids.raw()),
        origin,
        delivered: {
          occurrence: {
            to: "grantee",
            granted: { kind: "role", role: "editor" },
          },
          delivery: "direct",
        },
        recipient: ids.account(),
      },
      now,
    );
    let error: unknown = null;
    try {
      Notification.reconstruct({ ...snapshotOf(issued), delivery: "proxy" });
    } catch (e) {
      error = e;
    }
    expect(isRehydrationError(error)).toBe(true);
  });

  it("refuses a stray field that would change the addressing", () => {
    const P = ids.place();
    const issued = Notification.issue(
      {
        id: NotificationId.create(ids.raw()),
        origin,
        delivered: {
          occurrence: {
            to: "contentManagers",
            content: { kind: "place", id: P },
            matter: { kind: "suspended" },
          },
          delivery: "direct",
        },
        recipient: ids.account(),
      },
      now,
    );
    expect(() =>
      Notification.reconstruct({
        ...snapshotOf(issued),
        occurrence: { ...issued.occurrence, placeId: P },
      }),
    ).toThrow();
  });
});

describe("OccurrenceKey", () => {
  const P = ids.place();
  const R = ids.region();
  const suspended = {
    to: "contentManagers",
    content: { kind: "place", id: P },
    matter: { kind: "suspended" },
  } as const;

  it("is the same for the same origin and occurrence, whatever the field order", () => {
    const reordered = {
      matter: { kind: "suspended" },
      content: { id: P, kind: "place" },
      to: "contentManagers",
    } as const;
    expect(OccurrenceKey.of(origin, suspended)).toBe(
      OccurrenceKey.of(origin, reordered),
    );
  });

  it("differs by origin and by occurrence, and from a takedown outcome's", () => {
    const other = {
      by: "event",
      eventId: EventId.create("event-2"),
    } as const;
    expect(OccurrenceKey.of(origin, suspended)).not.toBe(
      OccurrenceKey.of(other, suspended),
    );
    expect(OccurrenceKey.of(origin, suspended)).not.toBe(
      OccurrenceKey.of(origin, {
        ...suspended,
        matter: { kind: "unsuspended" },
      }),
    );
    const claim = ids.claim();
    expect(OccurrenceKey.ofTakedownOutcome(claim)).toBe(
      OccurrenceKey.ofTakedownOutcome(claim),
    );
    expect(OccurrenceKey.ofTakedownOutcome(claim).split(",")[0]).toBe(
      "takedown-outcome",
    );
    expect(OccurrenceKey.of(origin, suspended).split(",")[0]).toBe(
      "occurrence",
    );
  });

  it("is the same when a redelivered event's occurrence is rebuilt", () => {
    const e = EventId.create("event-redelivered");
    const build = () =>
      ({
        to: "grantee",
        granted: { kind: "stewardship", target: { kind: "region", id: R } },
      }) as const;
    expect(OccurrenceKey.of({ by: "event", eventId: e }, build())).toBe(
      OccurrenceKey.of({ by: "event", eventId: e }, build()),
    );
  });

  it("reads only the identifying fields: extra fields do not change it", () => {
    for (const { name, delivered } of sampleOccurrences(ids).samples) {
      const widened = {
        ...delivered.occurrence,
        labels: ["名称"],
        observedAt: new Date("2026-09-01T00:00:00.000Z"),
      };
      expect(OccurrenceKey.of(origin, widened), name).toBe(
        OccurrenceKey.of(origin, delivered.occurrence),
      );
    }
  });

  it("differs between every sample occurrence of one origin", () => {
    const keys = sampleOccurrences(ids).samples.map(({ delivered }) =>
      OccurrenceKey.of(origin, delivered.occurrence),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tells apart occurrences that differ only in a kind or an id", () => {
    const A = ids.account();
    const role = (r: "editor" | "operator") =>
      ({ to: "grantee", granted: { kind: "role", role: r } }) as const;
    expect(OccurrenceKey.of(origin, role("editor"))).not.toBe(
      OccurrenceKey.of(origin, role("operator")),
    );
    const added = (appointee: typeof A) =>
      ({
        to: "placeStewards",
        placeId: P,
        subject: {
          kind: "place",
          matter: { kind: "steward_added", appointee },
        },
      }) as const;
    expect(OccurrenceKey.of(origin, added(A))).not.toBe(
      OccurrenceKey.of(origin, added(ids.account())),
    );
  });

  it("keys content origins by their token", () => {
    const a = { by: "content", token: "2026-09-01" } as const;
    expect(OccurrenceKey.of(a, suspended)).toBe(
      OccurrenceKey.of({ by: "content", token: "2026-09-01" }, suspended),
    );
    expect(OccurrenceKey.of(a, suspended)).not.toBe(
      OccurrenceKey.of({ by: "content", token: "2026-09-02" }, suspended),
    );
  });
});
