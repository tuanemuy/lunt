import { SystemError } from "@repo/core/application/errors";
import {
  type AuthorityEvent,
  AuthorityEvents,
} from "@repo/core/domain/authority/events";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import {
  AccountId,
  InvitationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { authorityEventDecoders } from "../eventDecoders";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const id = (n: number) =>
  `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`;
const account = AccountId.create(id(1));
const place = { kind: "place", id: PlaceId.create(id(2)) } as const;
const region = { kind: "region", id: RegionId.create(id(3)) } as const;
const occasion = { kind: "occasion", id: OccasionId.create(id(4)) } as const;

const drafts: readonly EventDraft<AuthorityEvent>[] = [
  AuthorityEvents.invitationIssued(
    place,
    InvitationId.create(id(5)),
    EmailAddress.create("c@example.com"),
    NOW,
  ),
  AuthorityEvents.stewardAppointed(region, account, "grant", NOW),
  AuthorityEvents.stewardRemoved(occasion, account, "withdrawn", NOW),
  AuthorityEvents.stewardshipVacated(place, NOW),
  AuthorityEvents.roleGranted("editor", account, NOW),
  AuthorityEvents.roleRevoked("operator", account, "revoked", NOW),
];

const meta = (draft: EventDraft<AuthorityEvent>) => ({
  id: EventId.create(id(99)),
  occurredAt: draft.occurredAt,
  aggregateId: draft.aggregateId,
});

describe("authorityEventDecoders", () => {
  it.each(drafts.map((draft) => [draft.type, draft] as const))(
    "decodes %s from its stored JSON payload",
    (_type, draft) => {
      const stored: unknown = JSON.parse(JSON.stringify(draft.payload));
      const decode = authorityEventDecoders[draft.type] as (
        payload: unknown,
        m: ReturnType<typeof meta>,
      ) => AuthorityEvent;
      expect(decode(stored, meta(draft))).toEqual({
        ...draft,
        id: id(99),
      });
    },
  );

  it("refuses a payload of the wrong shape or with an invalid value", () => {
    const decode = authorityEventDecoders["authority.invitation_issued"];
    const base = drafts[0];
    if (base === undefined) throw new Error("missing draft");
    for (const payload of [
      {
        target: { kind: "listing", id: id(2) },
        invitationId: id(5),
        email: "c@example.com",
      },
      { target: place, invitationId: id(5), email: "not-an-email" },
      { target: place, invitationId: id(5), email: "c@example.com", extra: 1 },
    ]) {
      expect(() => decode(payload, meta(base))).toThrow(SystemError);
    }
  });
});
