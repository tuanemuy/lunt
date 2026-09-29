import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotosTakenDownEvent } from "@repo/core/domain/common/photoEvents";
import type { ContentRef, ShowcaseRef } from "@repo/core/domain/common/refs";
import { ListingEvents } from "@repo/core/domain/listing/events";
import { ModerationEvents } from "@repo/core/domain/moderation/events";
import { OccasionEvents } from "@repo/core/domain/occasion/events";
import { PlaceEvents } from "@repo/core/domain/place/events";
import { RegionEvents } from "@repo/core/domain/region/events";
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

describe("Announcements (stage 2)", () => {
  const P = { kind: "place", id: ids.place() } as const;
  const L = { kind: "listing", id: ids.listing() } as const;
  const M = { kind: "listing", id: ids.listing() } as const;
  const A = ids.article();
  const B = ids.article();
  const withArticles = (
    ...articles: readonly Readonly<{
      articleId: typeof A;
      showcases: readonly ShowcaseRef[];
    }>[]
  ): AnnouncementFacts => ({
    ...AnnouncementFacts.none,
    showcasingArticles: articles,
  });
  const editors = (
    articleId: typeof A,
    change: Readonly<Record<string, unknown>>,
  ) => ({
    to: "editors",
    articleId,
    matter: { kind: "showcase_changed", change },
  });
  const occurrences = (e: NotifiableEvent, facts: AnnouncementFacts) =>
    Announcements.from(e, facts).map((a) => a.occurrence);

  it("announces a place's suspension to its managers and each showcasing article", () => {
    const e = event(PlaceEvents.suspended(P.id, now));
    expect(Announcements.showcaseRefsOf(e, [L.id, M.id])).toEqual([P, L, M]);
    const all = Announcements.from(
      e,
      withArticles(
        { articleId: A, showcases: [P, L] },
        { articleId: B, showcases: [M] },
      ),
    );
    expect(all.map((a) => a.occurrence)).toEqual([
      { to: "contentManagers", content: P, matter: { kind: "suspended" } },
      editors(A, { showcase: P, change: "suspended" }),
      editors(A, { showcase: L, change: "place_suspended" }),
      editors(B, { showcase: M, change: "place_suspended" }),
    ]);
    expect(new Set(all.map((a) => JSON.stringify(a.origin))).size).toBe(1);
    expect(
      occurrences(
        event(PlaceEvents.unsuspended(P.id, now)),
        withArticles({ articleId: A, showcases: [P] }),
      ),
    ).toEqual([
      { to: "contentManagers", content: P, matter: { kind: "unsuspended" } },
    ]);
  });

  it("announces only a closure among operating status changes, to editors only", () => {
    const facts = withArticles({ articleId: A, showcases: [P, L] });
    const closed = event(
      PlaceEvents.operatingStatusChanged(
        P.id,
        "open",
        "permanentlyClosed",
        now,
      ),
    );
    expect(occurrences(closed, facts)).toEqual([
      editors(A, { showcase: P, change: "closed" }),
      editors(A, { showcase: L, change: "place_closed" }),
    ]);
    const paused = event(
      PlaceEvents.operatingStatusChanged(
        P.id,
        "open",
        "temporarilyClosed",
        now,
      ),
    );
    expect(Announcements.showcaseRefsOf(paused, [L.id])).toEqual([]);
    expect(occurrences(paused, facts)).toEqual([]);
  });

  it("announces a listing's suspension to the place's managers and its showcases' editors", () => {
    const facts = withArticles({ articleId: A, showcases: [L] });
    expect(
      occurrences(event(ListingEvents.suspended(L.id, P.id, now)), facts),
    ).toEqual([
      {
        to: "contentManagers",
        content: L,
        placeId: P.id,
        matter: { kind: "suspended" },
      },
      editors(A, { showcase: L, change: "suspended" }),
    ]);
    expect(
      occurrences(event(ListingEvents.unsuspended(L.id, P.id, now)), facts),
    ).toEqual([
      {
        to: "contentManagers",
        content: L,
        placeId: P.id,
        matter: { kind: "unsuspended" },
      },
    ]);
    expect(
      occurrences(
        event(ListingEvents.unpublished(L.id, "photoTakedown", now)),
        facts,
      ),
    ).toEqual([editors(A, { showcase: L, change: "unpublished" })]);
    expect(occurrences(event(ListingEvents.deleted(L.id, now)), facts)).toEqual(
      [editors(A, { showcase: L, change: "deleted" })],
    );
  });

  it("keys a listing's end of offering by the day it was seen", () => {
    const facts = withArticles({ articleId: A, showcases: [L] });
    const day = LocalDate.parse("2026-09-28");
    const [first] = Announcements.from(
      event(ListingEvents.offeringEnded(L.id, day, now)),
      facts,
    );
    const [again] = Announcements.from(
      event(ListingEvents.offeringEnded(L.id, day, now)),
      facts,
    );
    expect(first?.occurrence).toEqual(
      editors(A, { showcase: L, change: "offering_ended" }),
    );
    expect(first?.origin).toEqual({ by: "content", token: day });
    expect(again?.origin).toEqual(first?.origin);
    expect(
      Announcements.from(
        event(ListingEvents.offeringEnded(L.id, day, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([]);
  });

  it("announces a retired category once per place holding it", () => {
    const K = ids.category();
    const Q = ids.place();
    const e = event(ListingEvents.categoryRetired(K, now));
    expect(
      occurrences(e, {
        ...AnnouncementFacts.none,
        placesOfRetiredCategory: [P.id, Q],
      }),
    ).toEqual(
      [P.id, Q].map((placeId) => ({
        to: "placeStewards",
        placeId,
        subject: {
          kind: "place",
          matter: { kind: "categories_reassigned", retiredCategoryId: K },
        },
      })),
    );
    expect(occurrences(e, AnnouncementFacts.none)).toEqual([]);
  });

  it("announces a photo takedown to the owner's managers, a listing's through its place", () => {
    const photo = PhotoId.create(ids.raw());
    const takenDown = (owner: ContentRef) =>
      event(
        PhotosTakenDownEvent.draft(
          { owner, photoIds: [photo], unpublished: true },
          now,
        ),
      );
    const matter = { kind: "photos_taken_down" };
    expect(
      occurrences(takenDown(L), {
        ...AnnouncementFacts.none,
        ownerListingPlace: P.id,
      }),
    ).toEqual([{ to: "contentManagers", content: L, placeId: P.id, matter }]);
    expect(occurrences(takenDown(L), AnnouncementFacts.none)).toEqual([]);
    for (const owner of [
      P,
      { kind: "region", id: ids.region() },
      { kind: "occasion", id: ids.occasion() },
      { kind: "article", id: A },
    ] as const) {
      expect(occurrences(takenDown(owner), AnnouncementFacts.none)).toEqual([
        { to: "contentManagers", content: owner, matter },
      ]);
    }
  });

  it("announces claims and reports to the operators, and a confirmation request to the place's stewards", () => {
    const Cl = ids.claim();
    const Rp = ids.report();
    expect(
      occurrences(
        event(ModerationEvents.takedownClaimSubmitted(Cl, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "operators",
        matter: { kind: "takedown_claim_received", claimId: Cl },
      },
    ]);
    expect(
      occurrences(
        event(ModerationEvents.infoReportSubmitted(Rp, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "operators",
        matter: { kind: "info_report_received", reportId: Rp },
      },
    ]);
    const matter = { kind: "confirmation_requested", reportId: Rp };
    expect(
      occurrences(
        event(
          ModerationEvents.infoReportConfirmationRequested(
            Rp,
            { kind: "place", placeId: P.id },
            now,
          ),
        ),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "placeStewards",
        placeId: P.id,
        subject: { kind: "place", matter },
      },
    ]);
    expect(
      occurrences(
        event(
          ModerationEvents.infoReportConfirmationRequested(
            Rp,
            { kind: "listing", placeId: P.id, listingId: L.id },
            now,
          ),
        ),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "placeStewards",
        placeId: P.id,
        subject: { kind: "listing", listingId: L.id, matter },
      },
    ]);
  });
});

describe("Announcements (stage 3)", () => {
  const P = { kind: "place", id: ids.place() } as const;
  const Q = { kind: "place", id: ids.place() } as const;
  const R = { kind: "region", id: ids.region() } as const;
  const C = { kind: "occasion", id: ids.occasion() } as const;
  const A = ids.article();
  const showcasing = (...showcases: readonly ShowcaseRef[]) => ({
    ...AnnouncementFacts.none,
    showcasingArticles: [{ articleId: A, showcases }],
  });
  const editors = (change: Readonly<Record<string, unknown>>) => ({
    to: "editors",
    articleId: A,
    matter: { kind: "showcase_changed", change },
  });
  const occurrences = (e: NotifiableEvent, facts: AnnouncementFacts) =>
    Announcements.from(e, facts).map((a) => a.occurrence);

  it("announces a region's suspension and its lifting to its managers, and the suspension and unpublishing to showcasing articles", () => {
    const facts = showcasing(R);
    const suspended = event(RegionEvents.suspended(R.id, now));
    expect(Announcements.showcaseRefsOf(suspended, [])).toEqual([R]);
    expect(occurrences(suspended, facts)).toEqual([
      { to: "contentManagers", content: R, matter: { kind: "suspended" } },
      editors({ showcase: R, change: "suspended" }),
    ]);
    expect(
      occurrences(event(RegionEvents.unsuspended(R.id, now)), facts),
    ).toEqual([
      { to: "contentManagers", content: R, matter: { kind: "unsuspended" } },
    ]);
    const unpublished = event(RegionEvents.unpublished(R.id, "byManager", now));
    expect(occurrences(unpublished, facts)).toEqual([
      editors({ showcase: R, change: "unpublished" }),
    ]);
    expect(occurrences(unpublished, AnnouncementFacts.none)).toEqual([]);
  });

  it("announces an exclusion from a region to the place's stewards, not a leave", () => {
    expect(
      occurrences(
        event(RegionEvents.affiliationDissolved(P.id, R.id, "excluded", now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "placeStewards",
        placeId: P.id,
        subject: {
          kind: "place",
          matter: { kind: "excluded_from_region", regionId: R.id },
        },
      },
    ]);
    expect(
      occurrences(
        event(RegionEvents.affiliationDissolved(P.id, R.id, "left", now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([]);
  });

  it("announces a cancellation and a period change to each participating place, and the cancellation to showcasing articles", () => {
    const facts = {
      ...showcasing(C),
      participatingPlaces: [P.id, Q.id],
    };
    const perPlace = (kind: string) =>
      [P, Q].map((place) => ({
        to: "placeStewards",
        placeId: place.id,
        subject: { kind: "place", matter: { kind, occasionId: C.id } },
      }));
    const cancelled = event(OccasionEvents.cancelled(C.id, now));
    expect(Announcements.showcaseRefsOf(cancelled, [])).toEqual([C]);
    const all = Announcements.from(cancelled, facts);
    expect(all.map((a) => a.occurrence)).toEqual([
      ...perPlace("occasion_cancelled"),
      editors({ showcase: C, change: "cancelled" }),
    ]);
    expect(new Set(all.map((a) => JSON.stringify(a.origin)))).toEqual(
      new Set([JSON.stringify({ by: "event", eventId: cancelled.id })]),
    );
    expect(
      occurrences(event(OccasionEvents.periodChanged(C.id, now)), facts),
    ).toEqual(perPlace("occasion_period_changed"));
    expect(
      occurrences(
        event(OccasionEvents.periodChanged(C.id, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([]);
  });

  it("announces an occasion's suspension, unpublishing and end to showcasing articles, the end keyed by the day it was seen", () => {
    const facts = showcasing(C);
    expect(
      occurrences(event(OccasionEvents.suspended(C.id, now)), facts),
    ).toEqual([
      { to: "contentManagers", content: C, matter: { kind: "suspended" } },
      editors({ showcase: C, change: "suspended" }),
    ]);
    expect(
      occurrences(event(OccasionEvents.unsuspended(C.id, now)), facts),
    ).toEqual([
      { to: "contentManagers", content: C, matter: { kind: "unsuspended" } },
    ]);
    expect(
      occurrences(
        event(OccasionEvents.unpublished(C.id, "photoTakedown", now)),
        facts,
      ),
    ).toEqual([editors({ showcase: C, change: "unpublished" })]);
    const day = LocalDate.parse("2026-10-04");
    const [ended] = Announcements.from(
      event(OccasionEvents.ended(C.id, day, now)),
      facts,
    );
    expect(ended?.occurrence).toEqual(
      editors({ showcase: C, change: "ended" }),
    );
    expect(ended?.origin).toEqual({ by: "content", token: day });
  });

  it("announces an exclusion to the place's stewards and a withdrawal to the occasion's stewards", () => {
    const dissolved = (cause: "excluded" | "withdrawn") =>
      occurrences(
        event(OccasionEvents.participationDissolved(C.id, P.id, cause, now)),
        AnnouncementFacts.none,
      );
    expect(dissolved("excluded")).toEqual([
      {
        to: "placeStewards",
        placeId: P.id,
        subject: {
          kind: "place",
          matter: { kind: "excluded_from_occasion", occasionId: C.id },
        },
      },
    ]);
    expect(dissolved("withdrawn")).toEqual([
      {
        to: "occasionStewards",
        occasionId: C.id,
        matter: { kind: "participation_withdrawn", placeId: P.id },
      },
    ]);
  });

  it("announces a participation's change by the place only", () => {
    const changed = (by: "place" | "occasion") =>
      occurrences(
        event(OccasionEvents.participationChanged(C.id, P.id, by, now)),
        AnnouncementFacts.none,
      );
    expect(changed("place")).toEqual([
      {
        to: "occasionStewards",
        occasionId: C.id,
        matter: { kind: "participation_changed", placeId: P.id },
      },
    ]);
    expect(changed("occasion")).toEqual([]);
  });

  it("announces a region link to the region's stewards and its detachment to the occasion's stewards", () => {
    expect(
      occurrences(
        event(OccasionEvents.regionLinked(C.id, R.id, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "regionStewards",
        regionId: R.id,
        matter: { kind: "occasion_linked", occasionId: C.id },
      },
    ]);
    expect(
      occurrences(
        event(OccasionEvents.regionLinkDetached(C.id, R.id, now)),
        AnnouncementFacts.none,
      ),
    ).toEqual([
      {
        to: "occasionStewards",
        occasionId: C.id,
        matter: { kind: "region_link_detached", regionId: R.id },
      },
    ]);
  });
});
