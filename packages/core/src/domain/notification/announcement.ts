import type { ApplicationEvent } from "@repo/core/domain/application/events";
import type {
  InvitationIssuedEvent,
  RoleGrantedEvent,
  RoleRevokedEvent,
  StewardAppointedEvent,
  StewardRemovedEvent,
} from "@repo/core/domain/authority/events";
import type { EventId } from "@repo/core/domain/common/event";
import type {
  AccountId,
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { PhotosTakenDownEvent } from "@repo/core/domain/common/photoEvents";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  CategoryRetiredEvent,
  ListingEvent,
} from "@repo/core/domain/listing/events";
import type {
  InfoReportConfirmationRequestedEvent,
  InfoReportSubmittedEvent,
  TakedownClaimSubmittedEvent,
} from "@repo/core/domain/moderation/events";
import type {
  OccasionCancelledEvent,
  OccasionEndedEvent,
  OccasionPeriodChangedEvent,
  OccasionSuspendedEvent,
  OccasionUnpublishedEvent,
  OccasionUnsuspendedEvent,
  ParticipationChangedEvent,
  ParticipationDissolvedEvent,
  RegionLinkDetachedEvent,
  RegionLinkedEvent,
} from "@repo/core/domain/occasion/events";
import type { PlaceEvent } from "@repo/core/domain/place/events";
import type {
  AffiliationDissolvedEvent,
  RegionAggregateEvent,
} from "@repo/core/domain/region/events";
import type {
  ApplicantMatter,
  ApproverMatter,
  DirectAudienceOccurrence,
  Occurrence,
  PlaceMatter,
  ShowcaseChange,
} from "./occurrence";

/**
 * What tells two announcements of the same occurrence apart from two
 * occurrences. `event`: one domain event is one occurrence, keyed by its id.
 * `content`: the same occurrence can arrive as several domain events (daily
 * jobs running concurrently), keyed by a token from the occurrence's content.
 */
export type Origin =
  | Readonly<{ by: "event"; eventId: EventId }>
  | Readonly<{ by: "content"; token: string }>;

/** Occurrences addressed to one account, which the announcement names. */
export type AccountAudienceOccurrence = Extract<
  DirectAudienceOccurrence,
  { to: "applicant" | "grantee" | "self" }
>;

/** An occurrence taken from a domain event, before its recipients are decided. */
export type Announcement =
  | Readonly<{
      occurrence: AccountAudienceOccurrence;
      /** The individual applicant, or the account granted / revoked. */
      accountId: AccountId;
      origin: Origin;
    }>
  | Readonly<{
      occurrence: Exclude<Occurrence, AccountAudienceOccurrence>;
      origin: Origin;
    }>;

export type AccountAnnouncement = Extract<
  Announcement,
  { accountId: AccountId }
>;

/**
 * The domain events of the correspondence table (`spec/domains/notification.md`
 * 「ドメインイベント」) whose stage has landed. A stage adds its events here
 * and the compiler then asks for their case in `Announcements.from` and
 * `Announcements.showcaseRefsOf`.
 */
export type NotifiableEvent =
  | InvitationIssuedEvent
  | StewardAppointedEvent
  | StewardRemovedEvent
  | RoleGrantedEvent
  | RoleRevokedEvent
  | ApplicationEvent
  | PlaceEvent
  | ListingEvent
  | CategoryRetiredEvent
  | PhotosTakenDownEvent
  | TakedownClaimSubmittedEvent
  | InfoReportSubmittedEvent
  | InfoReportConfirmationRequestedEvent
  | RegionNotifiableEvent
  | OccasionNotifiableEvent;

/** Region's events in the correspondence table (an affiliation's establishment is not). */
export type RegionNotifiableEvent =
  | RegionAggregateEvent
  | AffiliationDissolvedEvent;

/** Occasion's events in the correspondence table (a participation's establishment is not). */
export type OccasionNotifiableEvent =
  | OccasionPeriodChangedEvent
  | OccasionUnpublishedEvent
  | OccasionCancelledEvent
  | OccasionEndedEvent
  | OccasionSuspendedEvent
  | OccasionUnsuspendedEvent
  | ParticipationChangedEvent
  | ParticipationDissolvedEvent
  | RegionLinkedEvent
  | RegionLinkDetachedEvent;

export type NotifiableEventType = NotifiableEvent["type"];

/**
 * Facts some events need before they turn into announcements, read by the
 * usecase at consumption time.
 */
export type AnnouncementFacts = Readonly<{
  /** Places taking part in the event's occasion (`occasion.cancelled`, `occasion.period_changed`); no duplicates. */
  participatingPlaces: readonly PlaceId[];
  /** The place of the listing whose photos were taken down; `null` when the listing is gone. */
  ownerListingPlace: PlaceId | null;
  /** Places holding a listing of the retired category; no duplicates. */
  placesOfRetiredCategory: readonly PlaceId[];
  /**
   * Articles published at consumption time that showcase any of
   * `showcaseRefsOf`'s candidates, each with the candidates it showcases.
   */
  showcasingArticles: readonly Readonly<{
    articleId: ArticleId;
    showcases: readonly ShowcaseRef[];
  }>[];
}>;

const NO_FACTS: AnnouncementFacts = {
  participatingPlaces: [],
  ownerListingPlace: null,
  placesOfRetiredCategory: [],
  showcasingArticles: [],
};

const region = (id: RegionId) => ({ kind: "region", id }) as const;
const occasion = (id: OccasionId) => ({ kind: "occasion", id }) as const;

const byEvent = (event: NotifiableEvent): Origin => ({
  by: "event",
  eventId: event.id,
});

function applicantMatter(
  type: Extract<
    ApplicationEvent["type"],
    | "application.returned"
    | "application.approved"
    | "application.rejected"
    | "application.lapsed"
  >,
): ApplicantMatter {
  switch (type) {
    case "application.returned":
      return "returned";
    case "application.approved":
      return "approved";
    case "application.rejected":
      return "rejected";
    case "application.lapsed":
      return "lapsed";
  }
}

function approverMatter(
  type: Extract<
    ApplicationEvent["type"],
    | "application.submitted"
    | "application.resubmitted"
    | "application.withdrawn"
  >,
): ApproverMatter {
  switch (type) {
    case "application.submitted":
      return "submitted";
    case "application.resubmitted":
      return "resubmitted";
    case "application.withdrawn":
      return "withdrawn";
  }
}

function fromApplicationEvent(
  event: ApplicationEvent,
): readonly Announcement[] {
  const origin = byEvent(event);
  switch (event.type) {
    case "application.returned":
    case "application.approved":
    case "application.rejected":
    case "application.lapsed": {
      const { applicationId, applicant } = event.payload;
      const matter = applicantMatter(event.type);
      return [
        applicant.kind === "individual"
          ? {
              occurrence: {
                to: "applicant",
                applicant: { kind: "individual" },
                applicationId,
                matter,
              },
              accountId: applicant.accountId,
              origin,
            }
          : {
              occurrence: {
                to: "applicant",
                applicant: { kind: "place", placeId: applicant.placeId },
                applicationId,
                matter,
              },
              origin,
            },
      ];
    }
    case "application.submitted":
    case "application.resubmitted":
    case "application.withdrawn": {
      const { applicationId, approver } = event.payload;
      const matter = approverMatter(event.type);
      return [
        approver.kind === "operator"
          ? {
              occurrence: { to: "approver", approver, applicationId, matter },
              origin,
            }
          : {
              occurrence: { to: "approver", approver, applicationId, matter },
              origin,
            },
      ];
    }
    case "application.review_period_elapsed":
      return [
        {
          occurrence: {
            to: "operators",
            matter: {
              kind: "application_review_period_elapsed",
              applicationId: event.payload.applicationId,
            },
          },
          origin: {
            by: "content",
            token: event.payload.pendingSince.toISOString(),
          },
        },
      ];
  }
}

type AuthorityNotifiableEvent =
  | InvitationIssuedEvent
  | StewardAppointedEvent
  | StewardRemovedEvent
  | RoleGrantedEvent
  | RoleRevokedEvent;

function fromAuthorityEvent(
  event: AuthorityNotifiableEvent,
): readonly Announcement[] {
  switch (event.type) {
    case "authority.invitation_issued":
      return [
        {
          occurrence: {
            to: "invitee",
            email: event.payload.email,
            target: event.payload.target,
            invitationId: event.payload.invitationId,
          },
          origin: byEvent(event),
        },
      ];
    case "authority.steward_appointed": {
      const { target, accountId, via } = event.payload;
      if (via === "grant" && target.kind !== "place") {
        return [
          {
            occurrence: {
              to: "grantee",
              granted: { kind: "stewardship", target },
            },
            accountId,
            origin: byEvent(event),
          },
        ];
      }
      if (via === "application" && target.kind === "place") {
        return [
          {
            occurrence: {
              to: "placeStewards",
              placeId: target.id,
              subject: {
                kind: "place",
                matter: { kind: "steward_added", appointee: accountId },
              },
            },
            origin: byEvent(event),
          },
        ];
      }
      return [];
    }
    case "authority.steward_removed":
      return event.payload.reason === "revoked"
        ? [
            {
              occurrence: {
                to: "self",
                revoked: { kind: "stewardship", target: event.payload.target },
              },
              accountId: event.payload.accountId,
              origin: byEvent(event),
            },
          ]
        : [];
    case "authority.role_granted":
      return [
        {
          occurrence: {
            to: "grantee",
            granted: { kind: "role", role: event.payload.role },
          },
          accountId: event.payload.accountId,
          origin: byEvent(event),
        },
      ];
    case "authority.role_revoked":
      return event.payload.reason === "revoked"
        ? [
            {
              occurrence: {
                to: "self",
                revoked: { kind: "role", role: event.payload.role },
              },
              accountId: event.payload.accountId,
              origin: byEvent(event),
            },
          ]
        : [];
  }
}

type ListingChange = Extract<
  ShowcaseChange,
  { showcase: { kind: "listing" } }
>["change"];
type PlaceChange = Extract<
  ShowcaseChange,
  { showcase: { kind: "place" } }
>["change"];
type RegionChange = Extract<
  ShowcaseChange,
  { showcase: { kind: "region" } }
>["change"];
type OccasionChange = Extract<
  ShowcaseChange,
  { showcase: { kind: "occasion" } }
>["change"];

/**
 * How `event` changed `showcase`, one of its candidates; `null` for a
 * showcase kind the event does not change. A place's suspension or
 * closure changes the place and, through it, each of its listings.
 */
function showcaseChangeOf(
  event: NotifiableEvent,
  showcase: ShowcaseRef,
): ShowcaseChange | null {
  const ofListing = (change: ListingChange): ShowcaseChange | null =>
    showcase.kind === "listing" ? { showcase, change } : null;
  const ofRegion = (change: RegionChange): ShowcaseChange | null =>
    showcase.kind === "region" ? { showcase, change } : null;
  const ofOccasion = (change: OccasionChange): ShowcaseChange | null =>
    showcase.kind === "occasion" ? { showcase, change } : null;
  const ofPlace = (
    own: PlaceChange,
    listing: ListingChange,
  ): ShowcaseChange | null => {
    switch (showcase.kind) {
      case "place":
        return { showcase, change: own };
      case "listing":
        return { showcase, change: listing };
      default:
        return null;
    }
  };
  switch (event.type) {
    case "listing.suspended":
      return ofListing("suspended");
    case "listing.unpublished":
      return ofListing("unpublished");
    case "listing.deleted":
      return ofListing("deleted");
    case "listing.offering_ended":
      return ofListing("offering_ended");
    case "place.suspended":
      return ofPlace("suspended", "place_suspended");
    case "place.operating_status_changed":
      return event.payload.to === "permanentlyClosed"
        ? ofPlace("closed", "place_closed")
        : null;
    case "region.suspended":
      return ofRegion("suspended");
    case "region.unpublished":
      return ofRegion("unpublished");
    case "occasion.suspended":
      return ofOccasion("suspended");
    case "occasion.unpublished":
      return ofOccasion("unpublished");
    case "occasion.ended":
      return ofOccasion("ended");
    case "occasion.cancelled":
      return ofOccasion("cancelled");
    default:
      return null;
  }
}

/**
 * The editors' announcements (P-96): one per published article and
 * changed showcase it holds, as `facts.showcasingArticles` lists them.
 */
function showcaseAnnouncements(
  event: NotifiableEvent,
  facts: AnnouncementFacts,
  origin: Origin,
): readonly Announcement[] {
  return facts.showcasingArticles.flatMap(({ articleId, showcases }) =>
    showcases.flatMap((showcase): readonly Announcement[] => {
      const change = showcaseChangeOf(event, showcase);
      return change === null
        ? []
        : [
            {
              occurrence: {
                to: "editors",
                articleId,
                matter: { kind: "showcase_changed", change },
              },
              origin,
            },
          ];
    }),
  );
}

function fromPhotosTakenDown(
  event: PhotosTakenDownEvent,
  facts: AnnouncementFacts,
): readonly Announcement[] {
  const origin = byEvent(event);
  const matter = { kind: "photos_taken_down" } as const;
  const { owner } = event.payload;
  switch (owner.kind) {
    case "listing":
      return facts.ownerListingPlace === null
        ? []
        : [
            {
              occurrence: {
                to: "contentManagers",
                content: owner,
                placeId: facts.ownerListingPlace,
                matter,
              },
              origin,
            },
          ];
    case "article":
      return [
        {
          occurrence: { to: "contentManagers", content: owner, matter },
          origin,
        },
      ];
    default:
      return [
        {
          occurrence: { to: "contentManagers", content: owner, matter },
          origin,
        },
      ];
  }
}

function fromContentEvent(
  event: PlaceEvent | ListingEvent,
  facts: AnnouncementFacts,
): readonly Announcement[] {
  const origin = byEvent(event);
  switch (event.type) {
    case "place.suspended":
    case "place.unsuspended":
      return [
        {
          occurrence: {
            to: "contentManagers",
            content: { kind: "place", id: event.payload.placeId },
            matter: {
              kind:
                event.type === "place.suspended" ? "suspended" : "unsuspended",
            },
          },
          origin,
        },
        ...showcaseAnnouncements(event, facts, origin),
      ];
    case "listing.suspended":
    case "listing.unsuspended":
      return [
        {
          occurrence: {
            to: "contentManagers",
            content: { kind: "listing", id: event.payload.listingId },
            placeId: event.payload.placeId,
            matter: {
              kind:
                event.type === "listing.suspended"
                  ? "suspended"
                  : "unsuspended",
            },
          },
          origin,
        },
        ...showcaseAnnouncements(event, facts, origin),
      ];
    case "place.operating_status_changed":
    case "listing.unpublished":
    case "listing.deleted":
      return showcaseAnnouncements(event, facts, origin);
    case "listing.offering_ended":
      return showcaseAnnouncements(event, facts, {
        by: "content",
        token: event.payload.observedOn,
      });
  }
}

const suspensionMatter = (suspended: boolean) =>
  ({ kind: suspended ? "suspended" : "unsuspended" }) as const;

function fromRegionEvent(
  event: RegionNotifiableEvent,
  facts: AnnouncementFacts,
): readonly Announcement[] {
  const origin = byEvent(event);
  switch (event.type) {
    case "region.suspended":
    case "region.unsuspended":
      return [
        {
          occurrence: {
            to: "contentManagers",
            content: region(event.payload.regionId),
            matter: suspensionMatter(event.type === "region.suspended"),
          },
          origin,
        },
        ...showcaseAnnouncements(event, facts, origin),
      ];
    case "region.unpublished":
      return showcaseAnnouncements(event, facts, origin);
    case "region.affiliation_dissolved": {
      const { placeId, regionId, cause } = event.payload;
      return cause === "excluded"
        ? [
            {
              occurrence: {
                to: "placeStewards",
                placeId,
                subject: {
                  kind: "place",
                  matter: { kind: "excluded_from_region", regionId },
                },
              },
              origin,
            },
          ]
        : [];
    }
  }
}

/** One `placeStewards` announcement per place taking part in the occasion. */
function toParticipants(
  facts: AnnouncementFacts,
  origin: Origin,
  matter: Extract<
    PlaceMatter,
    { kind: "occasion_cancelled" | "occasion_period_changed" }
  >,
): readonly Announcement[] {
  return facts.participatingPlaces.map(
    (placeId): Announcement => ({
      occurrence: {
        to: "placeStewards",
        placeId,
        subject: { kind: "place", matter },
      },
      origin,
    }),
  );
}

function fromOccasionEvent(
  event: OccasionNotifiableEvent,
  facts: AnnouncementFacts,
): readonly Announcement[] {
  const origin = byEvent(event);
  switch (event.type) {
    case "occasion.suspended":
    case "occasion.unsuspended":
      return [
        {
          occurrence: {
            to: "contentManagers",
            content: occasion(event.payload.occasionId),
            matter: suspensionMatter(event.type === "occasion.suspended"),
          },
          origin,
        },
        ...showcaseAnnouncements(event, facts, origin),
      ];
    case "occasion.unpublished":
      return showcaseAnnouncements(event, facts, origin);
    case "occasion.ended":
      return showcaseAnnouncements(event, facts, {
        by: "content",
        token: event.payload.observedOn,
      });
    case "occasion.cancelled":
      return [
        ...toParticipants(facts, origin, {
          kind: "occasion_cancelled",
          occasionId: event.payload.occasionId,
        }),
        ...showcaseAnnouncements(event, facts, origin),
      ];
    case "occasion.period_changed":
      return toParticipants(facts, origin, {
        kind: "occasion_period_changed",
        occasionId: event.payload.occasionId,
      });
    case "occasion.participation_dissolved": {
      const { occasionId, placeId, cause } = event.payload;
      return [
        cause === "excluded"
          ? {
              occurrence: {
                to: "placeStewards",
                placeId,
                subject: {
                  kind: "place",
                  matter: { kind: "excluded_from_occasion", occasionId },
                },
              },
              origin,
            }
          : {
              occurrence: {
                to: "occasionStewards",
                occasionId,
                matter: { kind: "participation_withdrawn", placeId },
              },
              origin,
            },
      ];
    }
    case "occasion.participation_changed": {
      const { occasionId, placeId, changedBy } = event.payload;
      return changedBy === "place"
        ? [
            {
              occurrence: {
                to: "occasionStewards",
                occasionId,
                matter: { kind: "participation_changed", placeId },
              },
              origin,
            },
          ]
        : [];
    }
    case "occasion.region_linked":
      return [
        {
          occurrence: {
            to: "regionStewards",
            regionId: event.payload.regionId,
            matter: {
              kind: "occasion_linked",
              occasionId: event.payload.occasionId,
            },
          },
          origin,
        },
      ];
    case "occasion.region_link_detached":
      return [
        {
          occurrence: {
            to: "occasionStewards",
            occasionId: event.payload.occasionId,
            matter: {
              kind: "region_link_detached",
              regionId: event.payload.regionId,
            },
          },
          origin,
        },
      ];
  }
}

/**
 * The announcements a domain event makes — the correspondence table of
 * `spec/domains/notification.md` 「ドメインイベント」, and the only place it
 * lives. An event outside the table's conditions announces nothing.
 */
function from(
  event: NotifiableEvent,
  facts: AnnouncementFacts,
): readonly Announcement[] {
  switch (event.type) {
    case "authority.invitation_issued":
    case "authority.steward_appointed":
    case "authority.steward_removed":
    case "authority.role_granted":
    case "authority.role_revoked":
      return fromAuthorityEvent(event);
    case "application.submitted":
    case "application.resubmitted":
    case "application.withdrawn":
    case "application.returned":
    case "application.approved":
    case "application.rejected":
    case "application.lapsed":
    case "application.review_period_elapsed":
      return fromApplicationEvent(event);
    case "place.suspended":
    case "place.unsuspended":
    case "place.operating_status_changed":
    case "listing.suspended":
    case "listing.unsuspended":
    case "listing.unpublished":
    case "listing.deleted":
    case "listing.offering_ended":
      return fromContentEvent(event, facts);
    case "category.retired": {
      const origin = byEvent(event);
      const { categoryId } = event.payload;
      return facts.placesOfRetiredCategory.map(
        (placeId): Announcement => ({
          occurrence: {
            to: "placeStewards",
            placeId,
            subject: {
              kind: "place",
              matter: {
                kind: "categories_reassigned",
                retiredCategoryId: categoryId,
              },
            },
          },
          origin,
        }),
      );
    }
    case "content.photos_taken_down":
      return fromPhotosTakenDown(event, facts);
    case "region.unpublished":
    case "region.suspended":
    case "region.unsuspended":
    case "region.affiliation_dissolved":
      return fromRegionEvent(event, facts);
    case "occasion.period_changed":
    case "occasion.unpublished":
    case "occasion.cancelled":
    case "occasion.ended":
    case "occasion.suspended":
    case "occasion.unsuspended":
    case "occasion.participation_changed":
    case "occasion.participation_dissolved":
    case "occasion.region_linked":
    case "occasion.region_link_detached":
      return fromOccasionEvent(event, facts);
    case "takedown_claim.submitted":
      return [
        {
          occurrence: {
            to: "operators",
            matter: {
              kind: "takedown_claim_received",
              claimId: event.payload.claimId,
            },
          },
          origin: byEvent(event),
        },
      ];
    case "info_report.submitted":
      return [
        {
          occurrence: {
            to: "operators",
            matter: {
              kind: "info_report_received",
              reportId: event.payload.reportId,
            },
          },
          origin: byEvent(event),
        },
      ];
    case "info_report.confirmation_requested": {
      const { reportId, target } = event.payload;
      const matter = { kind: "confirmation_requested", reportId } as const;
      return [
        {
          occurrence: {
            to: "placeStewards",
            placeId: target.placeId,
            subject:
              target.kind === "listing"
                ? { kind: "listing", listingId: target.listingId, matter }
                : { kind: "place", matter },
          },
          origin: byEvent(event),
        },
      ];
    }
  }
}

const placeAndListings = (
  placeId: PlaceId,
  listings: readonly ListingId[],
): readonly ShowcaseRef[] => [
  { kind: "place", id: placeId },
  ...listings.map((id): ShowcaseRef => ({ kind: "listing", id })),
];

/**
 * The showcase candidates an event changed: the event's own content for
 * listing / region / occasion events, the place and `placeListings` for a
 * place's suspension or closure. Empty for events that change no
 * showcase.
 */
function showcaseRefsOf(
  event: NotifiableEvent,
  placeListings: readonly ListingId[],
): readonly ShowcaseRef[] {
  switch (event.type) {
    case "listing.suspended":
    case "listing.unpublished":
    case "listing.deleted":
    case "listing.offering_ended":
      return [{ kind: "listing", id: event.payload.listingId }];
    case "place.suspended":
      return placeAndListings(event.payload.placeId, placeListings);
    case "place.operating_status_changed":
      return event.payload.to === "permanentlyClosed"
        ? placeAndListings(event.payload.placeId, placeListings)
        : [];
    case "region.suspended":
    case "region.unpublished":
      return [region(event.payload.regionId)];
    case "occasion.suspended":
    case "occasion.unpublished":
    case "occasion.ended":
    case "occasion.cancelled":
      return [occasion(event.payload.occasionId)];
    default:
      return [];
  }
}

export const AnnouncementFacts = { none: NO_FACTS };

export const Announcements = { from, showcaseRefsOf };

export const Announcement = {
  isToAccount: (a: Announcement): a is AccountAnnouncement => "accountId" in a,
};
