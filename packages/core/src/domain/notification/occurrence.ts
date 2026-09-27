import type { ApproverSeat } from "@repo/core/domain/application/approverSeat";
import type { Role } from "@repo/core/domain/authority/role";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
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
import { ContentRef, type StewardedRef } from "@repo/core/domain/common/refs";

export type ApplicantMatter = "returned" | "approved" | "rejected" | "lapsed";
export type ApproverMatter = "submitted" | "resubmitted" | "withdrawn";

type RefOf<K extends ContentRef["kind"]> = Extract<ContentRef, { kind: K }>;

/** Steward seat of an application: a region or an occasion's stewards. */
export type StewardSeat = Extract<ApproverSeat, { kind: "steward" }>;
export type OperatorSeat = Extract<ApproverSeat, { kind: "operator" }>;

/**
 * Matters that happen to a place, listing, region, occasion or article in
 * the same words whatever the kind. Who hears of them follows from the
 * content's kind.
 */
export type ContentMatter =
  | Readonly<{ kind: "suspended" }>
  | Readonly<{ kind: "unsuspended" }>
  | Readonly<{ kind: "photos_taken_down" }>;

export type ContentOccurrence =
  | Readonly<{
      to: "contentManagers";
      content: RefOf<"place" | "region" | "occasion">;
      matter: ContentMatter;
    }>
  | Readonly<{
      to: "contentManagers";
      content: RefOf<"listing">;
      /** The place the listing belongs to. */
      placeId: PlaceId;
      matter: ContentMatter;
    }>
  | Readonly<{
      to: "contentManagers";
      content: RefOf<"article">;
      /** Articles are never suspended by the operators. */
      matter: Extract<ContentMatter, { kind: "photos_taken_down" }>;
    }>;

export type PlaceMatter =
  | Readonly<{ kind: "excluded_from_region"; regionId: RegionId }>
  | Readonly<{ kind: "excluded_from_occasion"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_cancelled"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_period_changed"; occasionId: OccasionId }>
  | Readonly<{ kind: "confirmation_requested"; reportId: InfoReportId }>
  | Readonly<{ kind: "categories_reassigned"; retiredCategoryId: CategoryId }>
  | Readonly<{ kind: "steward_added"; appointee: AccountId }>;

export type ListingMatter = Readonly<{
  kind: "confirmation_requested";
  reportId: InfoReportId;
}>;

/** What a place-stewards occurrence is about: the place or one of its listings. */
export type PlaceSubject =
  | Readonly<{ kind: "place"; matter: PlaceMatter }>
  | Readonly<{ kind: "listing"; listingId: ListingId; matter: ListingMatter }>;

export type RegionMatter = Readonly<{
  kind: "occasion_linked";
  occasionId: OccasionId;
}>;

export type OccasionMatter =
  | Readonly<{ kind: "participation_withdrawn"; placeId: PlaceId }>
  | Readonly<{ kind: "participation_changed"; placeId: PlaceId }>
  | Readonly<{ kind: "region_link_detached"; regionId: RegionId }>;

/**
 * A change to something a published article showcases. Each showcase kind
 * carries only the changes it can undergo.
 */
export type ShowcaseChange =
  | Readonly<{
      showcase: RefOf<"listing">;
      change:
        | "suspended"
        | "unpublished"
        | "deleted"
        | "offering_ended"
        | "place_suspended"
        | "place_closed";
    }>
  | Readonly<{ showcase: RefOf<"place">; change: "suspended" | "closed" }>
  | Readonly<{ showcase: RefOf<"region">; change: "suspended" | "unpublished" }>
  | Readonly<{
      showcase: RefOf<"occasion">;
      change: "suspended" | "unpublished" | "ended" | "cancelled";
    }>;

export type ArticleMatter = Readonly<{
  kind: "showcase_changed";
  change: ShowcaseChange;
}>;

export type OperatorMatter =
  | Readonly<{
      kind: "application_review_period_elapsed";
      applicationId: ApplicationId;
    }>
  | Readonly<{ kind: "takedown_claim_received"; claimId: TakedownClaimId }>
  | Readonly<{ kind: "info_report_received"; reportId: InfoReportId }>;

export type GrantedAuthority =
  | Readonly<{
      kind: "stewardship";
      target: RefOf<"region" | "occasion">;
    }>
  | Readonly<{ kind: "role"; role: Role }>;

export type RevokedAuthority =
  | Readonly<{ kind: "stewardship"; target: StewardedRef }>
  | Readonly<{ kind: "role"; role: Role }>;

/**
 * Occurrences addressed to every steward of a target (P-91 place
 * applicants, P-92 steward seats, P-93–P-95). Only these can be delivered
 * by proxy to the operators when the target has no steward.
 */
export type StewardAudienceOccurrence =
  | Readonly<{
      to: "applicant";
      applicant: Readonly<{ kind: "place"; placeId: PlaceId }>;
      applicationId: ApplicationId;
      matter: ApplicantMatter;
    }>
  | Readonly<{
      to: "approver";
      approver: StewardSeat;
      applicationId: ApplicationId;
      matter: ApproverMatter;
    }>
  | Readonly<{ to: "placeStewards"; placeId: PlaceId; subject: PlaceSubject }>
  | Readonly<{ to: "regionStewards"; regionId: RegionId; matter: RegionMatter }>
  | Readonly<{
      to: "occasionStewards";
      occasionId: OccasionId;
      matter: OccasionMatter;
    }>
  | Exclude<ContentOccurrence, { content: { kind: "article" } }>;

export type DirectAudienceOccurrence =
  | Readonly<{
      to: "applicant";
      applicant: Readonly<{ kind: "individual" }>;
      applicationId: ApplicationId;
      matter: ApplicantMatter;
    }>
  | Readonly<{
      to: "approver";
      approver: OperatorSeat;
      applicationId: ApplicationId;
      matter: ApproverMatter;
    }>
  | Readonly<{ to: "editors"; articleId: ArticleId; matter: ArticleMatter }>
  | Extract<ContentOccurrence, { content: { kind: "article" } }>
  | Readonly<{ to: "operators"; matter: OperatorMatter }>
  | Readonly<{
      to: "invitee";
      email: EmailAddress;
      target: StewardedRef;
      invitationId: InvitationId;
    }>
  | Readonly<{ to: "grantee"; granted: GrantedAuthority }>
  | Readonly<{ to: "self"; revoked: RevokedAuthority }>;

/**
 * Something Lunt notifies about (P-91–P-100), as the audience it goes to
 * (`to`) and what happened within it. The account an occurrence is about
 * (the applicant, the grantee) is not part of it: the announcement holds
 * it, and a notification holds it as `recipient`.
 */
export type Occurrence = StewardAudienceOccurrence | DirectAudienceOccurrence;

export type OccurrenceAudience = Occurrence["to"];

/** A reference an occurrence holds, resolved to a name for display. */
export type OccurrenceRef =
  | ContentRef
  | Readonly<{ kind: "category"; id: CategoryId }>
  | Readonly<{ kind: "application"; id: ApplicationId }>
  | Readonly<{ kind: "takedownClaim"; id: TakedownClaimId }>
  | Readonly<{ kind: "infoReport"; id: InfoReportId }>
  | Readonly<{ kind: "account"; id: AccountId }>;

export type OccurrenceRefKind = OccurrenceRef["kind"];

function isStewardAudience(o: Occurrence): o is StewardAudienceOccurrence {
  switch (o.to) {
    case "applicant":
      return o.applicant.kind === "place";
    case "approver":
      return o.approver.kind === "steward";
    case "placeStewards":
    case "regionStewards":
    case "occasionStewards":
      return true;
    case "contentManagers":
      return o.content.kind !== "article";
    case "editors":
    case "operators":
    case "invitee":
    case "grantee":
    case "self":
      return false;
  }
}

const place = (id: PlaceId): RefOf<"place"> => ({ kind: "place", id });
const region = (id: RegionId): RefOf<"region"> => ({ kind: "region", id });
const occasion = (id: OccasionId): RefOf<"occasion"> => ({
  kind: "occasion",
  id,
});
const listing = (id: ListingId): RefOf<"listing"> => ({ kind: "listing", id });
const article = (id: ArticleId): RefOf<"article"> => ({ kind: "article", id });

/** The content the occurrence points at; `null` for applications, claims, reports and roles. */
function pointedContent(o: Occurrence): ContentRef | null {
  switch (o.to) {
    case "contentManagers":
      return o.content;
    case "placeStewards":
      return o.subject.kind === "listing"
        ? listing(o.subject.listingId)
        : place(o.placeId);
    case "regionStewards":
      return region(o.regionId);
    case "occasionStewards":
      return occasion(o.occasionId);
    case "editors":
      return article(o.articleId);
    case "invitee":
      return o.target;
    case "grantee":
      return o.granted.kind === "stewardship" ? o.granted.target : null;
    case "self":
      return o.revoked.kind === "stewardship" ? o.revoked.target : null;
    case "applicant":
    case "approver":
    case "operators":
      return null;
  }
}

const refKey = (ref: OccurrenceRef): string => `${ref.kind}:${ref.id}`;

function placeMatterRefs(matter: PlaceMatter): readonly OccurrenceRef[] {
  switch (matter.kind) {
    case "excluded_from_region":
      return [region(matter.regionId)];
    case "excluded_from_occasion":
    case "occasion_cancelled":
    case "occasion_period_changed":
      return [occasion(matter.occasionId)];
    case "confirmation_requested":
      return [{ kind: "infoReport", id: matter.reportId }];
    case "categories_reassigned":
      return [{ kind: "category", id: matter.retiredCategoryId }];
    case "steward_added":
      return [{ kind: "account", id: matter.appointee }];
  }
}

function occasionMatterRefs(matter: OccasionMatter): readonly OccurrenceRef[] {
  switch (matter.kind) {
    case "participation_withdrawn":
    case "participation_changed":
      return [place(matter.placeId)];
    case "region_link_detached":
      return [region(matter.regionId)];
  }
}

function operatorMatterRefs(matter: OperatorMatter): readonly OccurrenceRef[] {
  switch (matter.kind) {
    case "application_review_period_elapsed":
      return [{ kind: "application", id: matter.applicationId }];
    case "takedown_claim_received":
      return [{ kind: "takedownClaim", id: matter.claimId }];
    case "info_report_received":
      return [{ kind: "infoReport", id: matter.reportId }];
  }
}

function listedRefs(o: Occurrence): readonly OccurrenceRef[] {
  switch (o.to) {
    case "applicant":
      return [
        ...(o.applicant.kind === "place" ? [place(o.applicant.placeId)] : []),
        { kind: "application", id: o.applicationId },
      ];
    case "approver":
      return [
        ...(o.approver.kind === "steward" ? [o.approver.target] : []),
        { kind: "application", id: o.applicationId },
      ];
    case "placeStewards":
      return o.subject.kind === "place"
        ? [place(o.placeId), ...placeMatterRefs(o.subject.matter)]
        : [
            place(o.placeId),
            listing(o.subject.listingId),
            { kind: "infoReport", id: o.subject.matter.reportId },
          ];
    case "regionStewards":
      return [region(o.regionId), occasion(o.matter.occasionId)];
    case "occasionStewards":
      return [occasion(o.occasionId), ...occasionMatterRefs(o.matter)];
    case "contentManagers":
      return o.content.kind === "listing" && "placeId" in o
        ? [o.content, place(o.placeId)]
        : [o.content];
    case "editors":
      return [article(o.articleId), o.matter.change.showcase];
    case "operators":
      return operatorMatterRefs(o.matter);
    case "invitee":
      return [o.target];
    case "grantee":
      return o.granted.kind === "stewardship" ? [o.granted.target] : [];
    case "self":
      return o.revoked.kind === "stewardship" ? [o.revoked.target] : [];
  }
}

/**
 * Every id the occurrence holds except the `InvitationId`, as references
 * to resolve names for — each once, in the order of the occurrence's
 * fields.
 */
function refsOf(o: Occurrence): readonly OccurrenceRef[] {
  const seen = new Set<string>();
  const refs: OccurrenceRef[] = [];
  for (const ref of listedRefs(o)) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

export const OccurrenceRef = {
  key: refKey,
  isContent: (ref: OccurrenceRef): ref is ContentRef =>
    ContentRef.isKind(ref.kind),
};

export const Occurrence = {
  isStewardAudience,
  pointedContent,
  refsOf,
};
