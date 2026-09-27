import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Applicant } from "./applicant";
import type { ApproverSeat } from "./approverSeat";

/** Payload of the events addressed to the applicant. */
export type ToApplicant = Readonly<{
  applicationId: ApplicationId;
  applicant: Applicant;
}>;

/**
 * Payload of the events addressed to the approver. `approver` is the
 * application's seat (`Application.approverSeat`); Notification decides the
 * recipients from it and the stewardship facts.
 */
export type ToApprover = Readonly<{
  applicationId: ApplicationId;
  approver: ApproverSeat;
}>;

/**
 * Payload of `application.review_period_elapsed`. `pendingSince` is the
 * `status.since` of the under-review spell that became proxyable; it keys
 * one notice per spell.
 */
export type ReviewPeriodElapsed = Readonly<{
  applicationId: ApplicationId;
  pendingSince: Date;
}>;

/** A new application (reapplications and companion claims included). */
export type ApplicationSubmittedEvent = DomainEventBase<
  "application.submitted",
  ToApprover
>;
export type ApplicationResubmittedEvent = DomainEventBase<
  "application.resubmitted",
  ToApprover
>;
/** Withdrawn by the applicant or by the applicant's account withdrawal. */
export type ApplicationWithdrawnEvent = DomainEventBase<
  "application.withdrawn",
  ToApprover
>;
export type ApplicationReturnedEvent = DomainEventBase<
  "application.returned",
  ToApplicant
>;
/** Approved by an approver or by an overdue proxy. */
export type ApplicationApprovedEvent = DomainEventBase<
  "application.approved",
  ToApplicant
>;
/** Rejected by an approver or by an overdue proxy. */
export type ApplicationRejectedEvent = DomainEventBase<
  "application.rejected",
  ToApplicant
>;
/** A premise stopped holding (on reassessment, resubmission or approval). */
export type ApplicationLapsedEvent = DomainEventBase<
  "application.lapsed",
  ToApplicant
>;
/** Drafted only by `OverdueReviewWatch.detect`. */
export type ApplicationReviewPeriodElapsedEvent = DomainEventBase<
  "application.review_period_elapsed",
  ReviewPeriodElapsed
>;

/**
 * Application's own domain events (`spec/domains/application.md`
 * 「ドメインイベント」). `aggregateId` is the `ApplicationId`. The payload
 * carries only what picks the recipients; consumers read the kind, target
 * and outcome through `ApplicationRepository.findById` / `findByIds` at
 * consumption time. Resubmission also drafts the shared kernel's
 * `photos.released`, which is not part of this union.
 */
export type ApplicationEvent =
  | ApplicationSubmittedEvent
  | ApplicationResubmittedEvent
  | ApplicationWithdrawnEvent
  | ApplicationReturnedEvent
  | ApplicationApprovedEvent
  | ApplicationRejectedEvent
  | ApplicationLapsedEvent
  | ApplicationReviewPeriodElapsedEvent;

export type ApplicationEventType = ApplicationEvent["type"];

export const APPLICATION_EVENT_TYPES = [
  "application.submitted",
  "application.resubmitted",
  "application.withdrawn",
  "application.returned",
  "application.approved",
  "application.rejected",
  "application.lapsed",
  "application.review_period_elapsed",
] as const satisfies readonly ApplicationEventType[];

function toApprover<E extends ApplicationEvent & { payload: ToApprover }>(
  type: E["type"],
): (
  applicationId: ApplicationId,
  approver: ApproverSeat,
  now: Date,
) => EventDraft<E> {
  return (applicationId, approver, now) =>
    ({
      type,
      payload: { applicationId, approver },
      occurredAt: now,
      aggregateId: applicationId,
    }) as unknown as EventDraft<E>;
}

function toApplicant<E extends ApplicationEvent & { payload: ToApplicant }>(
  type: E["type"],
): (
  applicationId: ApplicationId,
  applicant: Applicant,
  now: Date,
) => EventDraft<E> {
  return (applicationId, applicant, now) =>
    ({
      type,
      payload: { applicationId, applicant },
      occurredAt: now,
      aggregateId: applicationId,
    }) as unknown as EventDraft<E>;
}

/** Draft factories; the aggregate's behaviours are their only callers. */
export const ApplicationEvents = {
  submitted: toApprover<ApplicationSubmittedEvent>("application.submitted"),
  resubmitted: toApprover<ApplicationResubmittedEvent>(
    "application.resubmitted",
  ),
  withdrawn: toApprover<ApplicationWithdrawnEvent>("application.withdrawn"),
  returned: toApplicant<ApplicationReturnedEvent>("application.returned"),
  approved: toApplicant<ApplicationApprovedEvent>("application.approved"),
  rejected: toApplicant<ApplicationRejectedEvent>("application.rejected"),
  lapsed: toApplicant<ApplicationLapsedEvent>("application.lapsed"),
  reviewPeriodElapsed: (
    applicationId: ApplicationId,
    pendingSince: Date,
    now: Date,
  ): EventDraft<ApplicationReviewPeriodElapsedEvent> => ({
    type: "application.review_period_elapsed",
    payload: { applicationId, pendingSince },
    occurredAt: now,
    aggregateId: applicationId,
  }),
};
