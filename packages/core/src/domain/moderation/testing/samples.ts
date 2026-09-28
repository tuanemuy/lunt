import {
  AccountId,
  ArticleId,
  InfoReportId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import {
  type ConfirmationRequestedInfoReport,
  InfoReport,
  type OpenInfoReport,
  type ResolvedInfoReport,
} from "../infoReport";
import {
  type OpenTakedownClaim,
  type ResolvedTakedownClaim,
  TakedownClaim,
} from "../takedownClaim";
import type { ClaimantStanding, InfoReportCategory } from "../values";

export type ClaimSpec = Readonly<{
  id?: TakedownClaimId;
  standing?: ClaimantStanding;
  target?: ContentRef;
  photoIds?: readonly PhotoId[];
  reason?: string;
  email?: string;
  at?: Date;
}>;

export type ReportTargetSpec =
  | Readonly<{ kind: "place"; placeId: PlaceId }>
  | Readonly<{ kind: "listing"; placeId: PlaceId; listingId: ListingId }>;

export type ReportSpec = Readonly<{
  id?: InfoReportId;
  target?: ReportTargetSpec;
  category?: InfoReportCategory;
  content?: string;
  reporter?: AccountId;
  at?: Date;
}>;

/**
 * Claims and reports built through the domain (never SQL), with
 * UUIDv7-shaped ids minted in ascending order from `start` and a clock
 * that moves a minute per build unless a spec pins `at`.
 */
export function moderationSamples(start = 0x70_0000) {
  let counter = start;
  const next = (): string => {
    const tail = counter.toString(16).padStart(12, "0");
    counter += 1;
    return `ffffffff-ffff-7fff-8fff-${tail}`;
  };
  let clock = Date.parse("2026-09-01T00:00:00.000Z");
  const tick = (): Date => {
    clock += 60_000;
    return new Date(clock);
  };

  const ids = {
    claim: () => TakedownClaimId.create(next()),
    report: () => InfoReportId.create(next()),
    account: () => AccountId.create(next()),
    place: () => PlaceId.create(next()),
    listing: () => ListingId.create(next()),
    region: () => RegionId.create(next()),
    occasion: () => OccasionId.create(next()),
    article: () => ArticleId.create(next()),
    photo: () => PhotoId.create(next()),
    raw: next,
  };

  /** An open claim; a proprietor's on a new place unless `spec` says otherwise. */
  const openClaim = (spec: ClaimSpec = {}): OpenTakedownClaim => {
    const photoIds = spec.photoIds ?? [];
    const standing =
      spec.standing ??
      (photoIds.length > 0 ? "photoRightsHolder" : "proprietor");
    return TakedownClaim.submit(
      {
        id: spec.id ?? ids.claim(),
        standing,
        target: spec.target ?? { kind: "place", id: ids.place() },
        photoIds,
        reason: spec.reason ?? "無断で掲載されています",
        email: spec.email ?? "claimant@example.com",
      },
      { viewable: true, photoIds },
      spec.at ?? tick(),
    ).entity;
  };

  const resolvedClaim = (
    claim: OpenTakedownClaim,
    outcome = "写真を削除しました",
    at: Date = tick(),
  ): ResolvedTakedownClaim => TakedownClaim.resolve(claim, outcome, at).entity;

  /** An open report; about a new place unless `spec` says otherwise. */
  const openReport = (spec: ReportSpec = {}): OpenInfoReport => {
    const target = spec.target ?? { kind: "place", placeId: ids.place() };
    return InfoReport.submit(
      {
        id: spec.id ?? ids.report(),
        target:
          target.kind === "place"
            ? target
            : { kind: "listing", listingId: target.listingId },
        category: spec.category ?? "incorrectInfo",
        content: spec.content ?? "営業時間が違います",
      },
      { accountId: spec.reporter ?? ids.account() },
      { kind: "available", placeId: target.placeId, placeHasSteward: true },
      spec.at ?? tick(),
    ).entity;
  };

  const requested = (
    report: OpenInfoReport,
    at: Date = tick(),
  ): ConfirmationRequestedInfoReport =>
    InfoReport.requestConfirmation(report, { placeHasSteward: true }, at)
      .entity;

  const resolvedReport = (
    report: OpenInfoReport | ConfirmationRequestedInfoReport,
  ): ResolvedInfoReport => InfoReport.resolve(report);

  return {
    ids,
    tick,
    openClaim,
    resolvedClaim,
    openReport,
    requested,
    resolvedReport,
  };
}

export type ModerationSamples = ReturnType<typeof moderationSamples>;
