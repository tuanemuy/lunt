import type { ApproverSeat } from "@repo/core/domain/application/approverSeat";
import { Role } from "@repo/core/domain/authority/role";
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
import { StewardedRef } from "@repo/core/domain/common/refs";
import type { DeliveredOccurrence } from "./delivery";
import {
  type ApplicantMatter,
  type ApproverMatter,
  type ContentMatter,
  type GrantedAuthority,
  type OccasionMatter,
  Occurrence,
  type OperatorMatter,
  type PlaceMatter,
  type PlaceSubject,
  type RevokedAuthority,
  type ShowcaseChange,
} from "./occurrence";

// Reads an occurrence back from its stored JSON. Every object must carry
// exactly the fields of its variant: a stray field (a `placeId` on a
// place's content occurrence) would otherwise change how it is addressed.

type Fields = Readonly<Record<string, unknown>>;

function fields(value: unknown, keys: readonly string[], at: string): Fields {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${at}: not an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${at}: fields ${actual.join(",")}, expected ${expected}`);
  }
  return value as Fields;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string") throw new Error(`${at}: not a string`);
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  at: string,
): T {
  const raw = text(value, at);
  if (!(values as readonly string[]).includes(raw)) {
    throw new Error(`${at}: unknown value ${raw}`);
  }
  return raw as T;
}

function kindOf(value: unknown, at: string): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${at}: not an object`);
  }
  return text((value as Fields).kind, `${at}.kind`);
}

const APPLICANT_MATTERS = [
  "returned",
  "approved",
  "rejected",
  "lapsed",
] as const satisfies readonly ApplicantMatter[];
const APPROVER_MATTERS = [
  "submitted",
  "resubmitted",
  "withdrawn",
] as const satisfies readonly ApproverMatter[];

function stewardedRef(value: unknown, at: string): StewardedRef {
  const f = fields(value, ["kind", "id"], at);
  const kind = text(f.kind, `${at}.kind`);
  if (!StewardedRef.isKind(kind)) throw new Error(`${at}: kind ${kind}`);
  return StewardedRef.create(kind, text(f.id, `${at}.id`));
}

function seatTarget(
  value: unknown,
  at: string,
): Extract<StewardedRef, { kind: "region" | "occasion" }> {
  const ref = stewardedRef(value, at);
  if (ref.kind === "place") throw new Error(`${at}: a place`);
  return ref;
}

function contentMatter(value: unknown, at: string): ContentMatter {
  fields(value, ["kind"], at);
  return {
    kind: oneOf(
      kindOf(value, at),
      ["suspended", "unsuspended", "photos_taken_down"] as const,
      `${at}.kind`,
    ),
  };
}

function placeMatter(value: unknown, at: string): PlaceMatter {
  const kind = kindOf(value, at);
  switch (kind) {
    case "excluded_from_region": {
      const f = fields(value, ["kind", "regionId"], at);
      return { kind, regionId: RegionId.create(text(f.regionId, at)) };
    }
    case "excluded_from_occasion":
    case "occasion_cancelled":
    case "occasion_period_changed": {
      const f = fields(value, ["kind", "occasionId"], at);
      return { kind, occasionId: OccasionId.create(text(f.occasionId, at)) };
    }
    case "confirmation_requested": {
      const f = fields(value, ["kind", "reportId"], at);
      return { kind, reportId: InfoReportId.create(text(f.reportId, at)) };
    }
    case "categories_reassigned": {
      const f = fields(value, ["kind", "retiredCategoryId"], at);
      return {
        kind,
        retiredCategoryId: CategoryId.create(text(f.retiredCategoryId, at)),
      };
    }
    case "steward_added": {
      const f = fields(value, ["kind", "appointee"], at);
      return { kind, appointee: AccountId.create(text(f.appointee, at)) };
    }
    default:
      throw new Error(`${at}: unknown place matter ${kind}`);
  }
}

function placeSubject(value: unknown, at: string): PlaceSubject {
  const kind = kindOf(value, at);
  if (kind === "place") {
    const f = fields(value, ["kind", "matter"], at);
    return { kind, matter: placeMatter(f.matter, `${at}.matter`) };
  }
  if (kind === "listing") {
    const f = fields(value, ["kind", "listingId", "matter"], at);
    const m = fields(f.matter, ["kind", "reportId"], `${at}.matter`);
    return {
      kind,
      listingId: ListingId.create(text(f.listingId, at)),
      matter: {
        kind: oneOf(m.kind, ["confirmation_requested"] as const, at),
        reportId: InfoReportId.create(text(m.reportId, at)),
      },
    };
  }
  throw new Error(`${at}: unknown subject ${kind}`);
}

function occasionMatter(value: unknown, at: string): OccasionMatter {
  const kind = kindOf(value, at);
  switch (kind) {
    case "participation_withdrawn":
    case "participation_changed": {
      const f = fields(value, ["kind", "placeId"], at);
      return { kind, placeId: PlaceId.create(text(f.placeId, at)) };
    }
    case "region_link_detached": {
      const f = fields(value, ["kind", "regionId"], at);
      return { kind, regionId: RegionId.create(text(f.regionId, at)) };
    }
    default:
      throw new Error(`${at}: unknown occasion matter ${kind}`);
  }
}

function showcaseChange(value: unknown, at: string): ShowcaseChange {
  const f = fields(value, ["showcase", "change"], at);
  const s = fields(f.showcase, ["kind", "id"], `${at}.showcase`);
  const kind = text(s.kind, `${at}.showcase.kind`);
  const id = text(s.id, `${at}.showcase.id`);
  switch (kind) {
    case "listing":
      return {
        showcase: { kind, id: ListingId.create(id) },
        change: oneOf(
          f.change,
          [
            "suspended",
            "unpublished",
            "deleted",
            "offering_ended",
            "place_suspended",
            "place_closed",
          ] as const,
          at,
        ),
      };
    case "place":
      return {
        showcase: { kind, id: PlaceId.create(id) },
        change: oneOf(f.change, ["suspended", "closed"] as const, at),
      };
    case "region":
      return {
        showcase: { kind, id: RegionId.create(id) },
        change: oneOf(f.change, ["suspended", "unpublished"] as const, at),
      };
    case "occasion":
      return {
        showcase: { kind, id: OccasionId.create(id) },
        change: oneOf(
          f.change,
          ["suspended", "unpublished", "ended", "cancelled"] as const,
          at,
        ),
      };
    default:
      throw new Error(`${at}: unknown showcase ${kind}`);
  }
}

function operatorMatter(value: unknown, at: string): OperatorMatter {
  const kind = kindOf(value, at);
  switch (kind) {
    case "application_review_period_elapsed": {
      const f = fields(value, ["kind", "applicationId"], at);
      return {
        kind,
        applicationId: ApplicationId.create(text(f.applicationId, at)),
      };
    }
    case "takedown_claim_received": {
      const f = fields(value, ["kind", "claimId"], at);
      return { kind, claimId: TakedownClaimId.create(text(f.claimId, at)) };
    }
    case "info_report_received": {
      const f = fields(value, ["kind", "reportId"], at);
      return { kind, reportId: InfoReportId.create(text(f.reportId, at)) };
    }
    default:
      throw new Error(`${at}: unknown operator matter ${kind}`);
  }
}

function role(value: unknown, at: string): Role {
  const raw = text(value, at);
  if (!Role.is(raw)) throw new Error(`${at}: unknown role ${raw}`);
  return raw;
}

function granted(value: unknown, at: string): GrantedAuthority {
  const kind = kindOf(value, at);
  if (kind === "stewardship") {
    const f = fields(value, ["kind", "target"], at);
    return { kind, target: seatTarget(f.target, `${at}.target`) };
  }
  if (kind === "role") {
    const f = fields(value, ["kind", "role"], at);
    return { kind, role: role(f.role, `${at}.role`) };
  }
  throw new Error(`${at}: unknown authority ${kind}`);
}

function revoked(value: unknown, at: string): RevokedAuthority {
  const kind = kindOf(value, at);
  if (kind === "stewardship") {
    const f = fields(value, ["kind", "target"], at);
    return { kind, target: stewardedRef(f.target, `${at}.target`) };
  }
  if (kind === "role") {
    const f = fields(value, ["kind", "role"], at);
    return { kind, role: role(f.role, `${at}.role`) };
  }
  throw new Error(`${at}: unknown authority ${kind}`);
}

function approverSeat(value: unknown, at: string): ApproverSeat {
  const kind = kindOf(value, at);
  if (kind === "operator") {
    fields(value, ["kind"], at);
    return { kind };
  }
  if (kind === "steward") {
    const f = fields(value, ["kind", "target"], at);
    return { kind, target: seatTarget(f.target, `${at}.target`) };
  }
  throw new Error(`${at}: unknown seat ${kind}`);
}

function contentOccurrence(v: Fields): Occurrence {
  const kind = kindOf(v.content, "content");
  if (kind === "listing") {
    const f = fields(v, ["to", "content", "placeId", "matter"], "occurrence");
    const c = fields(f.content, ["kind", "id"], "content");
    return {
      to: "contentManagers",
      content: { kind, id: ListingId.create(text(c.id, "content.id")) },
      placeId: PlaceId.create(text(f.placeId, "placeId")),
      matter: contentMatter(f.matter, "matter"),
    };
  }
  const f = fields(v, ["to", "content", "matter"], "occurrence");
  const c = fields(f.content, ["kind", "id"], "content");
  const id = text(c.id, "content.id");
  const matter = contentMatter(f.matter, "matter");
  switch (kind) {
    case "article":
      if (matter.kind !== "photos_taken_down") {
        throw new Error("An article occurrence holds only photos_taken_down");
      }
      return {
        to: "contentManagers",
        content: { kind, id: ArticleId.create(id) },
        matter,
      };
    case "place":
      return {
        to: "contentManagers",
        content: { kind, id: PlaceId.create(id) },
        matter,
      };
    case "region":
      return {
        to: "contentManagers",
        content: { kind, id: RegionId.create(id) },
        matter,
      };
    case "occasion":
      return {
        to: "contentManagers",
        content: { kind, id: OccasionId.create(id) },
        matter,
      };
    default:
      throw new Error(`Unknown content kind ${kind}`);
  }
}

function readOccurrence(value: unknown): Occurrence {
  const to = text(
    (value as Fields | null | undefined)?.to ?? null,
    "occurrence.to",
  );
  switch (to) {
    case "applicant": {
      const f = fields(
        value,
        ["to", "applicant", "applicationId", "matter"],
        "occurrence",
      );
      const applicationId = ApplicationId.create(
        text(f.applicationId, "applicationId"),
      );
      const matter = oneOf(f.matter, APPLICANT_MATTERS, "matter");
      const kind = kindOf(f.applicant, "applicant");
      if (kind === "individual") {
        fields(f.applicant, ["kind"], "applicant");
        return {
          to,
          applicant: { kind },
          applicationId,
          matter,
        };
      }
      if (kind === "place") {
        const a = fields(f.applicant, ["kind", "placeId"], "applicant");
        return {
          to,
          applicant: {
            kind,
            placeId: PlaceId.create(text(a.placeId, "placeId")),
          },
          applicationId,
          matter,
        };
      }
      throw new Error(`Unknown applicant ${kind}`);
    }
    case "approver": {
      const f = fields(
        value,
        ["to", "approver", "applicationId", "matter"],
        "occurrence",
      );
      const applicationId = ApplicationId.create(
        text(f.applicationId, "applicationId"),
      );
      const matter = oneOf(f.matter, APPROVER_MATTERS, "matter");
      const seat = approverSeat(f.approver, "approver");
      return seat.kind === "operator"
        ? { to, approver: seat, applicationId, matter }
        : { to, approver: seat, applicationId, matter };
    }
    case "placeStewards": {
      const f = fields(value, ["to", "placeId", "subject"], "occurrence");
      return {
        to,
        placeId: PlaceId.create(text(f.placeId, "placeId")),
        subject: placeSubject(f.subject, "subject"),
      };
    }
    case "regionStewards": {
      const f = fields(value, ["to", "regionId", "matter"], "occurrence");
      const m = fields(f.matter, ["kind", "occasionId"], "matter");
      return {
        to,
        regionId: RegionId.create(text(f.regionId, "regionId")),
        matter: {
          kind: oneOf(m.kind, ["occasion_linked"] as const, "matter.kind"),
          occasionId: OccasionId.create(text(m.occasionId, "occasionId")),
        },
      };
    }
    case "occasionStewards": {
      const f = fields(value, ["to", "occasionId", "matter"], "occurrence");
      return {
        to,
        occasionId: OccasionId.create(text(f.occasionId, "occasionId")),
        matter: occasionMatter(f.matter, "matter"),
      };
    }
    case "contentManagers":
      return contentOccurrence(value as Fields);
    case "editors": {
      const f = fields(value, ["to", "articleId", "matter"], "occurrence");
      const m = fields(f.matter, ["kind", "change"], "matter");
      return {
        to,
        articleId: ArticleId.create(text(f.articleId, "articleId")),
        matter: {
          kind: oneOf(m.kind, ["showcase_changed"] as const, "matter.kind"),
          change: showcaseChange(m.change, "matter.change"),
        },
      };
    }
    case "operators": {
      const f = fields(value, ["to", "matter"], "occurrence");
      return { to, matter: operatorMatter(f.matter, "matter") };
    }
    case "invitee": {
      const f = fields(
        value,
        ["to", "email", "target", "invitationId"],
        "occurrence",
      );
      const email = EmailAddress.create(text(f.email, "email"));
      if (email !== f.email) throw new Error("Stored email is not normalized");
      return {
        to,
        email,
        target: stewardedRef(f.target, "target"),
        invitationId: InvitationId.create(text(f.invitationId, "invitationId")),
      };
    }
    case "grantee": {
      const f = fields(value, ["to", "granted"], "occurrence");
      return { to, granted: granted(f.granted, "granted") };
    }
    case "self": {
      const f = fields(value, ["to", "revoked"], "occurrence");
      return { to, revoked: revoked(f.revoked, "revoked") };
    }
    default:
      throw new Error(`Unknown audience ${to}`);
  }
}

/**
 * Rebuilds a stored occurrence and its delivery. Throws a plain `Error` on
 * any value the types cannot hold — `proxy` on an occurrence that is not
 * addressed to a target's stewards included; callers wrap it in their
 * `RehydrationError`.
 */
function readDelivered(
  occurrence: unknown,
  delivery: string,
): DeliveredOccurrence {
  const o = readOccurrence(occurrence);
  if (Occurrence.isStewardAudience(o)) {
    return {
      occurrence: o,
      delivery: oneOf(delivery, ["direct", "proxy"] as const, "delivery"),
    };
  }
  if (delivery !== "direct") {
    throw new Error(`${o.to} occurrences are delivered directly only`);
  }
  return { occurrence: o, delivery: "direct" };
}

export const OccurrenceCodec = { readOccurrence, readDelivered };
