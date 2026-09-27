import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import type { Origin } from "./announcement";
import type { Occurrence } from "./occurrence";

declare const occurrenceKeyBrand: unique symbol;

/**
 * A non-empty string equal for the same occurrence and different for
 * different ones. With the recipient it keys a notification; with the
 * address it keys a mail.
 */
export type OccurrenceKey = string & { readonly [occurrenceKeyBrand]: true };

/** Identifies one mail: its occurrence and its address. */
export type MailKey = Readonly<{
  occurrenceKey: OccurrenceKey;
  to: EmailAddress;
}>;

const OCCURRENCE_PREFIX = "occurrence";
const TAKEDOWN_OUTCOME_PREFIX = "takedown-outcome";

type Part = string;

const ref = (kind: string, id: string): Part => `${kind}:${id}`;

function placeStewardParts(
  o: Extract<Occurrence, { to: "placeStewards" }>,
): readonly Part[] {
  const place = ref("place", o.placeId);
  const { subject } = o;
  if (subject.kind === "listing") {
    return [
      "listing",
      subject.matter.kind,
      place,
      ref("listing", subject.listingId),
      ref("infoReport", subject.matter.reportId),
    ];
  }
  const { matter } = subject;
  switch (matter.kind) {
    case "excluded_from_region":
      return ["place", matter.kind, place, ref("region", matter.regionId)];
    case "excluded_from_occasion":
    case "occasion_cancelled":
    case "occasion_period_changed":
      return ["place", matter.kind, place, ref("occasion", matter.occasionId)];
    case "confirmation_requested":
      return ["place", matter.kind, place, ref("infoReport", matter.reportId)];
    case "categories_reassigned":
      return [
        "place",
        matter.kind,
        place,
        ref("category", matter.retiredCategoryId),
      ];
    case "steward_added":
      return ["place", matter.kind, place, ref("account", matter.appointee)];
  }
}

function operatorParts(
  o: Extract<Occurrence, { to: "operators" }>,
): readonly Part[] {
  const { matter } = o;
  switch (matter.kind) {
    case "application_review_period_elapsed":
      return [matter.kind, ref("application", matter.applicationId)];
    case "takedown_claim_received":
      return [matter.kind, ref("takedownClaim", matter.claimId)];
    case "info_report_received":
      return [matter.kind, ref("infoReport", matter.reportId)];
  }
}

function bodyParts(o: Occurrence): readonly Part[] {
  switch (o.to) {
    case "applicant":
      return [
        o.applicant.kind,
        o.matter,
        ...(o.applicant.kind === "place"
          ? [ref("place", o.applicant.placeId)]
          : []),
        ref("application", o.applicationId),
      ];
    case "approver":
      return [
        o.approver.kind,
        o.matter,
        ...(o.approver.kind === "steward"
          ? [ref(o.approver.target.kind, o.approver.target.id)]
          : []),
        ref("application", o.applicationId),
      ];
    case "placeStewards":
      return placeStewardParts(o);
    case "regionStewards":
      return [
        o.matter.kind,
        ref("region", o.regionId),
        ref("occasion", o.matter.occasionId),
      ];
    case "occasionStewards":
      return [
        o.matter.kind,
        ref("occasion", o.occasionId),
        o.matter.kind === "region_link_detached"
          ? ref("region", o.matter.regionId)
          : ref("place", o.matter.placeId),
      ];
    case "contentManagers":
      return [
        o.matter.kind,
        ref(o.content.kind, o.content.id),
        ...("placeId" in o ? [ref("place", o.placeId)] : []),
      ];
    case "editors":
      return [
        o.matter.kind,
        o.matter.change.change,
        ref("article", o.articleId),
        ref(o.matter.change.showcase.kind, o.matter.change.showcase.id),
      ];
    case "operators":
      return operatorParts(o);
    case "invitee":
      return [
        ref(o.target.kind, o.target.id),
        ref("invitation", o.invitationId),
        ref("email", o.email),
      ];
    case "grantee":
      return o.granted.kind === "stewardship"
        ? [o.granted.kind, ref(o.granted.target.kind, o.granted.target.id)]
        : [o.granted.kind, o.granted.role];
    case "self":
      return o.revoked.kind === "stewardship"
        ? [o.revoked.kind, ref(o.revoked.target.kind, o.revoked.target.id)]
        : [o.revoked.kind, o.revoked.role];
  }
}

/**
 * The occurrence's fingerprint (`spec/domains/notification.md`
 * 「OccurrenceKey」): its audience, the kinds of its matter, then every id
 * it holds (content refs with their kind) and its address, in a fixed
 * order per audience. Built field by field, so nothing outside those
 * identifying fields can change a key.
 */
const fingerprint = (o: Occurrence): readonly Part[] => [o.to, ...bodyParts(o)];

// Each part is escaped, so the separator cannot occur inside one.
const joined = (parts: readonly Part[]): string =>
  parts.map(encodeURIComponent).join(",");

const originPart = (origin: Origin): Part =>
  origin.by === "event" ? `event:${origin.eventId}` : `content:${origin.token}`;

/**
 * The key of `occurrence` announced from `origin`: the origin, then the
 * occurrence's fingerprint. Redelivering an event yields the same key; the
 * several occurrences one event makes yield different ones.
 */
function of(origin: Origin, occurrence: Occurrence): OccurrenceKey {
  return joined([
    OCCURRENCE_PREFIX,
    originPart(origin),
    ...fingerprint(occurrence),
  ]) as OccurrenceKey;
}

/** The key of a takedown claim's outcome mail: one per claim. */
function ofTakedownOutcome(claimId: TakedownClaimId): OccurrenceKey {
  return joined([TAKEDOWN_OUTCOME_PREFIX, claimId]) as OccurrenceKey;
}

/** Rehydrates a stored key; throws on an empty string. */
function create(raw: string): OccurrenceKey {
  if (raw.length === 0) throw new Error("Empty occurrence key");
  return raw as OccurrenceKey;
}

export const OccurrenceKey = { of, ofTakedownOutcome, create };

export const MailKey = {
  equals: (a: MailKey, b: MailKey): boolean =>
    a.occurrenceKey === b.occurrenceKey && a.to === b.to,
  /** A map key unique per mail key. */
  key: (k: MailKey): string => `${k.to} ${k.occurrenceKey}`,
};
