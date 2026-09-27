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
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  ApplicantMatter,
  ApproverMatter,
  DirectAudienceOccurrence,
  Occurrence,
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
  | ApplicationEvent;

export type NotifiableEventType = NotifiableEvent["type"];

/**
 * Facts some events need before they turn into announcements, read by the
 * usecase at consumption time. No stage-1 event needs any of them.
 */
export type AnnouncementFacts = Readonly<{
  /** Places taking part in the event's occasion (`occasion.cancelled`, `occasion.period_changed`). */
  participatingPlaces: readonly PlaceId[];
  /** The place of the listing whose photos were taken down; `null` when the listing is gone. */
  ownerListingPlace: PlaceId | null;
  /** Places holding a listing of the retired category; no duplicates. */
  placesOfRetiredCategory: readonly PlaceId[];
  /** Published articles showcasing any of `showcaseRefsOf`'s candidates. */
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

/**
 * The announcements a domain event makes — the correspondence table of
 * `spec/domains/notification.md` 「ドメインイベント」, and the only place it
 * lives. An event outside the table's conditions announces nothing.
 */
function from(
  event: NotifiableEvent,
  _facts: AnnouncementFacts,
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
    default:
      return fromApplicationEvent(event);
  }
}

/**
 * The showcase candidates an event changed: the event's own content for
 * listing / region / occasion events, the place and `placeListings` for a
 * place's suspension or closure. Empty for events that change no
 * showcase — every stage-1 event.
 */
function showcaseRefsOf(
  event: NotifiableEvent,
  _placeListings: readonly ListingId[],
): readonly ShowcaseRef[] {
  switch (event.type) {
    case "authority.invitation_issued":
    case "authority.steward_appointed":
    case "authority.steward_removed":
    case "authority.role_granted":
    case "authority.role_revoked":
    case "application.submitted":
    case "application.resubmitted":
    case "application.withdrawn":
    case "application.returned":
    case "application.approved":
    case "application.rejected":
    case "application.lapsed":
    case "application.review_period_elapsed":
      return [];
  }
}

export const AnnouncementFacts = { none: NO_FACTS };

export const Announcements = { from, showcaseRefsOf };

export const Announcement = {
  isToAccount: (a: Announcement): a is AccountAnnouncement => "accountId" in a,
};
