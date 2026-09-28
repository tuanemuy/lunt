import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  AccountId,
  InfoReportId,
  PhotoId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import {
  InfoReport,
  type InfoReportStatus,
} from "@repo/core/domain/moderation/infoReport";
import type { ContentSummary } from "@repo/core/domain/moderation/ports/contentDirectory";
import type {
  TakedownClaim,
  TakedownClaimStatus,
} from "@repo/core/domain/moderation/takedownClaim";
import type { TakedownOutcome } from "@repo/core/domain/moderation/takedownOutcome";
import {
  type ClaimantStanding,
  type InfoReportCategory,
  type InfoReportContent,
  InfoReportTarget,
  TakedownGround,
  type TakedownReason,
} from "@repo/core/domain/moderation/values";

/** A takedown claim as the operators see it. */
export type TakedownClaimView = Readonly<{
  claimId: TakedownClaimId;
  standing: ClaimantStanding;
  target: ContentRef;
  /** The photos the claimant named, in their order; empty for a proprietor. */
  claimedPhotoIds: readonly PhotoId[];
  reason: TakedownReason;
  email: EmailAddress;
  receivedAt: Date;
  status: TakedownClaimStatus;
  /** Set once resolved. */
  outcome: TakedownOutcome | null;
}>;

export const takedownClaimView = (claim: TakedownClaim): TakedownClaimView => ({
  claimId: claim.id,
  standing: claim.ground.standing,
  target: claim.ground.target,
  claimedPhotoIds: TakedownGround.photoIdsOf(claim.ground),
  reason: claim.reason,
  email: claim.email,
  receivedAt: claim.receivedAt,
  status: claim.status,
  outcome: claim.status === "resolved" ? claim.outcome : null,
});

/** An info report's own fields, without names. */
export type InfoReportView = Readonly<{
  reportId: InfoReportId;
  target: InfoReportTarget;
  category: InfoReportCategory;
  content: InfoReportContent;
  reporter: AccountId;
  receivedAt: Date;
  status: InfoReportStatus;
  /** When the stewards were asked to check it; `null` when never asked. */
  requestedAt: Date | null;
}>;

export const infoReportView = (report: InfoReport): InfoReportView => ({
  reportId: report.id,
  target: report.target,
  category: report.category,
  content: report.content,
  reporter: report.reporter,
  receivedAt: report.receivedAt,
  status: report.status,
  requestedAt: InfoReport.confirmationRequestOf(report)?.requestedAt ?? null,
});

/**
 * An info report's target with the names resolved whether viewers can see
 * it or not. Places are never deleted, so only a listing target can be
 * gone.
 */
export type InfoReportTargetView = Readonly<{
  target: InfoReportTarget;
  /** `null` only if the place's record is missing. */
  placeName: string | null;
  /** A listing target's name; `null` for a place target, a deleted listing or an unnamed draft. */
  listingName: string | null;
  /** Whether the reported target (the listing, for a listing target) exists. */
  exists: boolean;
}>;

/** The refs to describe for `targets`: each target, and a listing target's place. */
export const infoReportRefs = (
  targets: readonly InfoReportTarget[],
): readonly ContentRef[] =>
  targets.flatMap((target) =>
    target.kind === "place"
      ? [InfoReportTarget.contentRef(target)]
      : [
          InfoReportTarget.contentRef(target),
          { kind: "place", id: target.placeId },
        ],
  );

export function infoReportTargetView(
  target: InfoReportTarget,
  described: ReadonlyMap<string, ContentSummary>,
): InfoReportTargetView {
  const place = described.get(
    ContentRef.key({ kind: "place", id: target.placeId }),
  );
  if (target.kind === "place") {
    return {
      target,
      placeName: place?.name ?? null,
      listingName: null,
      exists: place !== undefined,
    };
  }
  const listing = described.get(
    ContentRef.key(InfoReportTarget.contentRef(target)),
  );
  return {
    target,
    placeName: place?.name ?? null,
    listingName: listing?.name ?? null,
    exists: listing !== undefined,
  };
}
