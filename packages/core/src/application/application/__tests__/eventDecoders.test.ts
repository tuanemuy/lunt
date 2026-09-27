import { SystemError } from "@repo/core/application/errors";
import {
  type ApplicationEvent,
  ApplicationEvents,
} from "@repo/core/domain/application/events";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import {
  AccountId,
  ApplicationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { applicationEventDecoders } from "../eventDecoders";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const SINCE = new Date("2026-09-20T09:30:00.000Z");
const id = (n: number) =>
  `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`;
const app = ApplicationId.create(id(1));
const individual = {
  kind: "individual",
  accountId: AccountId.create(id(2)),
} as const;
const place = { kind: "place", placeId: PlaceId.create(id(3)) } as const;
const operator = { kind: "operator" } as const;
const regionSeat = {
  kind: "steward",
  target: { kind: "region", id: RegionId.create(id(4)) },
} as const;
const occasionSeat = {
  kind: "steward",
  target: { kind: "occasion", id: OccasionId.create(id(5)) },
} as const;

const drafts: readonly EventDraft<ApplicationEvent>[] = [
  ApplicationEvents.submitted(app, operator, NOW),
  ApplicationEvents.resubmitted(app, regionSeat, NOW),
  ApplicationEvents.withdrawn(app, occasionSeat, NOW),
  ApplicationEvents.returned(app, place, NOW),
  ApplicationEvents.approved(app, individual, NOW),
  ApplicationEvents.rejected(app, place, NOW),
  ApplicationEvents.lapsed(app, individual, NOW),
  ApplicationEvents.reviewPeriodElapsed(app, SINCE, NOW),
];

const meta = (draft: EventDraft<ApplicationEvent>) => ({
  id: EventId.create(id(99)),
  occurredAt: draft.occurredAt,
  aggregateId: draft.aggregateId,
});

const decodeAny = (type: ApplicationEvent["type"]) =>
  applicationEventDecoders[type] as (
    payload: unknown,
    m: ReturnType<typeof meta>,
  ) => ApplicationEvent;

describe("applicationEventDecoders", () => {
  it("covers every Application event type", () => {
    expect(Object.keys(applicationEventDecoders).sort()).toEqual(
      drafts.map((draft) => draft.type).sort(),
    );
  });

  it.each(drafts.map((draft) => [draft.type, draft] as const))(
    "decodes %s from its stored JSON payload",
    (type, draft) => {
      const stored: unknown = JSON.parse(JSON.stringify(draft.payload));
      expect(decodeAny(type)(stored, meta(draft))).toEqual({
        ...draft,
        id: id(99),
      });
    },
  );

  it("keys the aggregate by the application id", () => {
    for (const draft of drafts) expect(draft.aggregateId).toBe(app);
  });

  it.each([
    [
      "application.submitted",
      {
        applicationId: id(1),
        approver: { kind: "steward", target: { kind: "place", id: id(3) } },
      },
    ],
    [
      "application.submitted",
      { applicationId: id(1), approver: operator, extra: true },
    ],
    [
      "application.approved",
      { applicationId: id(1), applicant: { kind: "place", accountId: id(2) } },
    ],
    ["application.approved", { applicationId: " ", applicant: individual }],
    [
      "application.review_period_elapsed",
      { applicationId: id(1), pendingSince: "yesterday" },
    ],
    [
      "application.review_period_elapsed",
      { applicationId: id(1), pendingSince: SINCE.getTime() },
    ],
  ] as const)("refuses a malformed %s payload (%#)", (type, payload) => {
    const draft = drafts.find((d) => d.type === type);
    if (draft === undefined) throw new Error("missing draft");
    expect(() => decodeAny(type)(payload, meta(draft))).toThrow(SystemError);
  });
});
