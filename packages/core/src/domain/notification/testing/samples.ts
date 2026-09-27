import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  AccountId,
  ApplicationId,
  ArticleId,
  CategoryId,
  InfoReportId,
  InvitationId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { DeliveredOccurrence } from "../delivery";
import type {
  DirectAudienceOccurrence,
  Occurrence,
  StewardAudienceOccurrence,
} from "../occurrence";

/**
 * Ids for notification tests, ascending in mint order, one sequence per
 * call. They are UUIDv7-shaped (the same shape as the test id generator's)
 * because the adapters accept only ids the wired generator could mint.
 */
export function notificationIds(start = 0x20_0000) {
  let counter = start;
  const ids = {
    next: (): string => {
      const tail = counter.toString(16).padStart(12, "0");
      counter += 1;
      return `ffffffff-ffff-7fff-8fff-${tail}`;
    },
  };
  return {
    account: () => AccountId.create(ids.next()),
    place: () => PlaceId.create(ids.next()),
    listing: () => ListingId.create(ids.next()),
    region: () => RegionId.create(ids.next()),
    occasion: () => OccasionId.create(ids.next()),
    article: () => ArticleId.create(ids.next()),
    category: () => CategoryId.create(ids.next()),
    application: () => ApplicationId.create(ids.next()),
    claim: () => TakedownClaimId.create(ids.next()),
    report: () => InfoReportId.create(ids.next()),
    invitation: () => InvitationId.create(ids.next()),
    raw: () => ids.next(),
  };
}

export type NotificationIds = ReturnType<typeof notificationIds>;

export type Sample = Readonly<{ name: string; delivered: DeliveredOccurrence }>;

const direct = (occurrence: DirectAudienceOccurrence): DeliveredOccurrence => ({
  occurrence,
  delivery: "direct",
});
const stewarded = (
  occurrence: StewardAudienceOccurrence,
  delivery: "direct" | "proxy" = "direct",
): DeliveredOccurrence => ({ occurrence, delivery });

/**
 * One delivered occurrence per audience and per variant the types hold —
 * every place / listing subject, every content kind, both deliveries of
 * steward audiences.
 */
export function sampleOccurrences(ids: NotificationIds = notificationIds()) {
  const place = ids.place();
  const listing = ids.listing();
  const region = ids.region();
  const occasion = ids.occasion();
  const article = ids.article();
  const samples: Sample[] = [
    {
      name: "applicant (individual)",
      delivered: direct({
        to: "applicant",
        applicant: { kind: "individual" },
        applicationId: ids.application(),
        matter: "returned",
      }),
    },
    {
      name: "applicant (place)",
      delivered: stewarded({
        to: "applicant",
        applicant: { kind: "place", placeId: place },
        applicationId: ids.application(),
        matter: "lapsed",
      }),
    },
    {
      name: "approver (operator)",
      delivered: direct({
        to: "approver",
        approver: { kind: "operator" },
        applicationId: ids.application(),
        matter: "submitted",
      }),
    },
    {
      name: "approver (steward, proxy)",
      delivered: stewarded(
        {
          to: "approver",
          approver: {
            kind: "steward",
            target: { kind: "region", id: region },
          },
          applicationId: ids.application(),
          matter: "resubmitted",
        },
        "proxy",
      ),
    },
    ...(
      [
        { kind: "excluded_from_region", regionId: region },
        { kind: "excluded_from_occasion", occasionId: occasion },
        { kind: "occasion_cancelled", occasionId: occasion },
        { kind: "occasion_period_changed", occasionId: occasion },
        { kind: "confirmation_requested", reportId: ids.report() },
        { kind: "categories_reassigned", retiredCategoryId: ids.category() },
        { kind: "steward_added", appointee: ids.account() },
      ] as const
    ).map(
      (matter): Sample => ({
        name: `placeStewards / place ${matter.kind}`,
        delivered: stewarded({
          to: "placeStewards",
          placeId: place,
          subject: { kind: "place", matter },
        }),
      }),
    ),
    {
      name: "placeStewards / listing confirmation_requested",
      delivered: stewarded({
        to: "placeStewards",
        placeId: place,
        subject: {
          kind: "listing",
          listingId: listing,
          matter: { kind: "confirmation_requested", reportId: ids.report() },
        },
      }),
    },
    {
      name: "regionStewards",
      delivered: stewarded({
        to: "regionStewards",
        regionId: region,
        matter: { kind: "occasion_linked", occasionId: occasion },
      }),
    },
    ...(
      [
        { kind: "participation_withdrawn", placeId: place },
        { kind: "participation_changed", placeId: place },
        { kind: "region_link_detached", regionId: region },
      ] as const
    ).map(
      (matter): Sample => ({
        name: `occasionStewards / ${matter.kind}`,
        delivered: stewarded({
          to: "occasionStewards",
          occasionId: occasion,
          matter,
        }),
      }),
    ),
    {
      name: "contentManagers / place",
      delivered: stewarded({
        to: "contentManagers",
        content: { kind: "place", id: place },
        matter: { kind: "suspended" },
      }),
    },
    {
      name: "contentManagers / listing",
      delivered: stewarded({
        to: "contentManagers",
        content: { kind: "listing", id: listing },
        placeId: place,
        matter: { kind: "unsuspended" },
      }),
    },
    {
      name: "contentManagers / region",
      delivered: stewarded({
        to: "contentManagers",
        content: { kind: "region", id: region },
        matter: { kind: "photos_taken_down" },
      }),
    },
    {
      name: "contentManagers / occasion",
      delivered: stewarded({
        to: "contentManagers",
        content: { kind: "occasion", id: occasion },
        matter: { kind: "suspended" },
      }),
    },
    {
      name: "contentManagers / article",
      delivered: direct({
        to: "contentManagers",
        content: { kind: "article", id: article },
        matter: { kind: "photos_taken_down" },
      }),
    },
    {
      name: "editors",
      delivered: direct({
        to: "editors",
        articleId: article,
        matter: {
          kind: "showcase_changed",
          change: {
            showcase: { kind: "listing", id: listing },
            change: "place_closed",
          },
        },
      }),
    },
    ...(
      [
        {
          kind: "application_review_period_elapsed",
          applicationId: ids.application(),
        },
        { kind: "takedown_claim_received", claimId: ids.claim() },
        { kind: "info_report_received", reportId: ids.report() },
      ] as const
    ).map(
      (matter): Sample => ({
        name: `operators / ${matter.kind}`,
        delivered: direct({ to: "operators", matter }),
      }),
    ),
    {
      name: "invitee",
      delivered: direct({
        to: "invitee",
        email: EmailAddress.create("invitee@example.com"),
        target: { kind: "place", id: place },
        invitationId: ids.invitation(),
      }),
    },
    {
      name: "grantee / stewardship",
      delivered: direct({
        to: "grantee",
        granted: {
          kind: "stewardship",
          target: { kind: "occasion", id: occasion },
        },
      }),
    },
    {
      name: "grantee / role",
      delivered: direct({
        to: "grantee",
        granted: { kind: "role", role: "editor" },
      }),
    },
    {
      name: "self / stewardship",
      delivered: direct({
        to: "self",
        revoked: { kind: "stewardship", target: { kind: "place", id: place } },
      }),
    },
    {
      name: "self / role",
      delivered: direct({
        to: "self",
        revoked: { kind: "role", role: "operator" },
      }),
    },
  ];
  return { samples, place, listing, region, occasion, article };
}

/** The audiences (`Occurrence["to"]`) the samples cover — all of them. */
export const AUDIENCES = [
  "applicant",
  "approver",
  "placeStewards",
  "regionStewards",
  "occasionStewards",
  "contentManagers",
  "editors",
  "operators",
  "invitee",
  "grantee",
  "self",
] as const satisfies readonly Occurrence["to"][];
