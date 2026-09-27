import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import {
  AnnouncementFacts,
  Announcements,
  type NotifiableEvent,
} from "../announcement";
import { notificationIds } from "../testing/samples";

const ids = notificationIds();
const now = new Date("2026-09-28T00:00:00.000Z");
let n = 0;
const event = <E extends NotifiableEvent>(draft: EventDraft<E>): E => {
  n += 1;
  return { ...draft, id: EventId.create(`event-${n}`) } as E;
};
const from = (e: NotifiableEvent) =>
  Announcements.from(e, AnnouncementFacts.none);

describe("Announcements.from (stage 1)", () => {
  const P = { kind: "place", id: ids.place() } as const;
  const R = { kind: "region", id: ids.region() } as const;
  const U = ids.account();

  it("announces invitations to the address, keyed by the event", () => {
    const e = event(
      AuthorityEvents.invitationIssued(
        P,
        ids.invitation(),
        EmailAddress.create("u@example.com"),
        now,
      ),
    );
    const [a] = from(e);
    expect(a?.occurrence).toMatchObject({ to: "invitee", target: P });
    expect(a?.origin).toEqual({ by: "event", eventId: e.id });
  });

  it("announces a grant to the grantee and an approval's appointee to the other stewards", () => {
    expect(
      from(event(AuthorityEvents.stewardAppointed(R, U, "grant", now))),
    ).toEqual([
      expect.objectContaining({
        occurrence: {
          to: "grantee",
          granted: { kind: "stewardship", target: R },
        },
        accountId: U,
      }),
    ]);
    expect(
      from(event(AuthorityEvents.stewardAppointed(P, U, "application", now)))[0]
        ?.occurrence,
    ).toEqual({
      to: "placeStewards",
      placeId: P.id,
      subject: {
        kind: "place",
        matter: { kind: "steward_added", appointee: U },
      },
    });
    expect(
      from(event(AuthorityEvents.stewardAppointed(P, U, "invitation", now))),
    ).toEqual([]);
  });

  it("announces revocations only", () => {
    for (const reason of ["resigned", "withdrawn"] as const) {
      expect(
        from(event(AuthorityEvents.stewardRemoved(P, U, reason, now))),
      ).toEqual([]);
    }
    expect(
      from(event(AuthorityEvents.roleRevoked("editor", U, "withdrawn", now))),
    ).toEqual([]);
    expect(
      from(event(AuthorityEvents.roleRevoked("editor", U, "revoked", now)))[0]
        ?.occurrence,
    ).toEqual({ to: "self", revoked: { kind: "role", role: "editor" } });
  });

  it("announces applications to the applicant, the approver or the operators", () => {
    const Ap = ids.application();
    const [individual] = from(
      event(
        ApplicationEvents.approved(
          Ap,
          { kind: "individual", accountId: U },
          now,
        ),
      ),
    );
    expect(individual).toMatchObject({
      occurrence: { to: "applicant", applicant: { kind: "individual" } },
      accountId: U,
    });
    const [place] = from(
      event(
        ApplicationEvents.lapsed(Ap, { kind: "place", placeId: P.id }, now),
      ),
    );
    expect(place?.occurrence).toEqual({
      to: "applicant",
      applicant: { kind: "place", placeId: P.id },
      applicationId: Ap,
      matter: "lapsed",
    });
    const pendingSince = new Date("2026-09-01T00:00:00.000Z");
    const [elapsed] = from(
      event(ApplicationEvents.reviewPeriodElapsed(Ap, pendingSince, now)),
    );
    expect(elapsed?.origin).toEqual({
      by: "content",
      token: pendingSince.toISOString(),
    });
  });

  it("finds no showcase in a stage-1 event", () => {
    expect(
      Announcements.showcaseRefsOf(
        event(AuthorityEvents.roleGranted("editor", U, now)),
        [],
      ),
    ).toEqual([]);
  });
});
