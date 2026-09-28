import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type {
  InfoReportId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { InfoReportTarget } from "./values";

/** A takedown claim was received (`TakedownClaim.submit`). `aggregateId` is the claim id. */
export type TakedownClaimSubmittedEvent = DomainEventBase<
  "takedown_claim.submitted",
  { claimId: TakedownClaimId }
>;

/**
 * The operators closed a takedown claim with an outcome
 * (`TakedownClaim.resolve`); the claimant's outcome mail is sent from it.
 * `aggregateId` is the claim id.
 */
export type TakedownClaimResolvedEvent = DomainEventBase<
  "takedown_claim.resolved",
  { claimId: TakedownClaimId }
>;

/** An info report was received (`InfoReport.submit`). `aggregateId` is the report id. */
export type InfoReportSubmittedEvent = DomainEventBase<
  "info_report.submitted",
  { reportId: InfoReportId }
>;

/**
 * The operators asked the place's stewards to check a report
 * (`InfoReport.requestConfirmation`). `target.placeId` is the place whose
 * stewards are notified. `aggregateId` is the report id.
 */
export type InfoReportConfirmationRequestedEvent = DomainEventBase<
  "info_report.confirmation_requested",
  { reportId: InfoReportId; target: InfoReportTarget }
>;

export type TakedownClaimEvent =
  | TakedownClaimSubmittedEvent
  | TakedownClaimResolvedEvent;

export type InfoReportEvent =
  | InfoReportSubmittedEvent
  | InfoReportConfirmationRequestedEvent;

/** Every Moderation event. Resolving an info report emits none. */
export type ModerationEvent = TakedownClaimEvent | InfoReportEvent;

export const MODERATION_EVENT_TYPES = [
  "takedown_claim.submitted",
  "takedown_claim.resolved",
  "info_report.submitted",
  "info_report.confirmation_requested",
] as const satisfies readonly ModerationEvent["type"][];

export const ModerationEvents = {
  takedownClaimSubmitted: (
    claimId: TakedownClaimId,
    now: Date,
  ): EventDraft<TakedownClaimSubmittedEvent> => ({
    type: "takedown_claim.submitted",
    payload: { claimId },
    occurredAt: now,
    aggregateId: claimId,
  }),
  takedownClaimResolved: (
    claimId: TakedownClaimId,
    now: Date,
  ): EventDraft<TakedownClaimResolvedEvent> => ({
    type: "takedown_claim.resolved",
    payload: { claimId },
    occurredAt: now,
    aggregateId: claimId,
  }),
  infoReportSubmitted: (
    reportId: InfoReportId,
    now: Date,
  ): EventDraft<InfoReportSubmittedEvent> => ({
    type: "info_report.submitted",
    payload: { reportId },
    occurredAt: now,
    aggregateId: reportId,
  }),
  infoReportConfirmationRequested: (
    reportId: InfoReportId,
    target: InfoReportTarget,
    now: Date,
  ): EventDraft<InfoReportConfirmationRequestedEvent> => ({
    type: "info_report.confirmation_requested",
    payload: { reportId, target },
    occurredAt: now,
    aggregateId: reportId,
  }),
};
