import type {
  ApplicationId,
  ArticleId,
  InfoReportId,
  InvitationId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { DeliveredOccurrence } from "./delivery";
import type {
  ContentOccurrence,
  GrantedAuthority,
  Occurrence,
  PlaceMatter,
  StewardAudienceOccurrence,
} from "./occurrence";

export type PlaceFacet =
  | "overview"
  | "profile"
  | "listings"
  | "affiliations"
  | "participations"
  | "members";

/** Where a notification opens when its audience receives it directly. */
export type DirectDestination =
  | Readonly<{ kind: "ownApplication"; applicationId: ApplicationId }>
  | Readonly<{ kind: "applicationReview"; applicationId: ApplicationId }>
  | Readonly<{ kind: "placeManagement"; placeId: PlaceId; facet: PlaceFacet }>
  | Readonly<{
      kind: "participationEditing";
      placeId: PlaceId;
      occasionId: OccasionId;
    }>
  | Readonly<{ kind: "listingManagement"; listingId: ListingId }>
  | Readonly<{ kind: "confirmationRequest"; reportId: InfoReportId }>
  | Readonly<{
      kind: "regionManagement";
      regionId: RegionId;
      facet: "content" | "occasionLinks";
    }>
  | Readonly<{
      kind: "occasionManagement";
      occasionId: OccasionId;
      facet: "content" | "regionLinks";
    }>
  | Readonly<{
      /** The occasion's participant, showing that place's current participation. */
      kind: "occasionParticipant";
      occasionId: OccasionId;
      placeId: PlaceId;
    }>
  | Readonly<{ kind: "articleEditing"; articleId: ArticleId }>
  | Readonly<{ kind: "takedownClaimHandling"; claimId: TakedownClaimId }>
  | Readonly<{ kind: "infoReportHandling"; reportId: InfoReportId }>
  | Readonly<{
      /** An invitation is found by its target and id together (Authority). */
      kind: "invitation";
      target: StewardedRef;
      invitationId: InvitationId;
    }>
  | Readonly<{ kind: "grantedAuthority"; granted: GrantedAuthority }>;

/**
 * Where a notification and its mail open, as a kind and ids — no screen,
 * no URL. `proxyOperation`: an operator standing in for a target without
 * stewards; `direct` is what a steward would have opened. Whether the
 * operator can open that as a stand-in is the presentation's call.
 */
export type NotificationDestination =
  | DirectDestination
  | Readonly<{
      kind: "proxyOperation";
      target: StewardedRef;
      direct: DirectDestination;
    }>;

export type NotificationDestinationKind = NotificationDestination["kind"];

function placeMatterDestination(
  placeId: PlaceId,
  matter: PlaceMatter,
): DirectDestination {
  switch (matter.kind) {
    case "excluded_from_region":
      return { kind: "placeManagement", placeId, facet: "affiliations" };
    case "excluded_from_occasion":
      return { kind: "placeManagement", placeId, facet: "participations" };
    case "occasion_cancelled":
    case "occasion_period_changed":
      return {
        kind: "participationEditing",
        placeId,
        occasionId: matter.occasionId,
      };
    case "categories_reassigned":
      return { kind: "placeManagement", placeId, facet: "listings" };
    case "steward_added":
      return { kind: "placeManagement", placeId, facet: "members" };
    case "confirmation_requested":
      return { kind: "confirmationRequest", reportId: matter.reportId };
  }
}

function contentDestination(o: ContentOccurrence): DirectDestination {
  switch (o.content.kind) {
    case "place":
      return {
        kind: "placeManagement",
        placeId: o.content.id,
        facet: o.matter.kind === "photos_taken_down" ? "profile" : "overview",
      };
    case "listing":
      return { kind: "listingManagement", listingId: o.content.id };
    case "region":
      return {
        kind: "regionManagement",
        regionId: o.content.id,
        facet: "content",
      };
    case "occasion":
      return {
        kind: "occasionManagement",
        occasionId: o.content.id,
        facet: "content",
      };
    case "article":
      return { kind: "articleEditing", articleId: o.content.id };
  }
}

function directOf(o: Occurrence): DirectDestination | null {
  switch (o.to) {
    case "applicant":
      return { kind: "ownApplication", applicationId: o.applicationId };
    case "approver":
      return { kind: "applicationReview", applicationId: o.applicationId };
    case "contentManagers":
      return contentDestination(o);
    case "placeStewards":
      return o.subject.kind === "listing"
        ? { kind: "confirmationRequest", reportId: o.subject.matter.reportId }
        : placeMatterDestination(o.placeId, o.subject.matter);
    case "regionStewards":
      return {
        kind: "regionManagement",
        regionId: o.regionId,
        facet: "occasionLinks",
      };
    case "occasionStewards":
      return o.matter.kind === "region_link_detached"
        ? {
            kind: "occasionManagement",
            occasionId: o.occasionId,
            facet: "regionLinks",
          }
        : {
            kind: "occasionParticipant",
            occasionId: o.occasionId,
            placeId: o.matter.placeId,
          };
    case "editors":
      return { kind: "articleEditing", articleId: o.articleId };
    case "operators":
      switch (o.matter.kind) {
        case "application_review_period_elapsed":
          return {
            kind: "applicationReview",
            applicationId: o.matter.applicationId,
          };
        case "takedown_claim_received":
          return { kind: "takedownClaimHandling", claimId: o.matter.claimId };
        case "info_report_received":
          return { kind: "infoReportHandling", reportId: o.matter.reportId };
      }
      break;
    case "invitee":
      return {
        kind: "invitation",
        target: o.target,
        invitationId: o.invitationId,
      };
    case "grantee":
      return { kind: "grantedAuthority", granted: o.granted };
    case "self":
      return null;
  }
}

function stewardDirectOf(o: StewardAudienceOccurrence): DirectDestination {
  const direct = directOf(o);
  if (direct === null) {
    throw new Error(`A ${o.to} occurrence always has a destination`);
  }
  return direct;
}

/**
 * Where the delivered occurrence opens (`spec/domains/notification.md`
 * 「NotificationDestination」; the first matching row wins). The only
 * place this mapping lives: the notification list and the mail both use
 * it. `null` when there is nothing to open (a revocation).
 */
function of(d: DeliveredOccurrence): NotificationDestination | null {
  if (d.delivery === "proxy") {
    if (d.occurrence.to === "approver") {
      return {
        kind: "applicationReview",
        applicationId: d.occurrence.applicationId,
      };
    }
    const target = DeliveredOccurrence.vacantTarget(d);
    if (target === null) throw new Error("A proxy delivery has a target");
    return {
      kind: "proxyOperation",
      target,
      direct: stewardDirectOf(d.occurrence),
    };
  }
  return directOf(d.occurrence);
}

export const NotificationDestination = { of };
