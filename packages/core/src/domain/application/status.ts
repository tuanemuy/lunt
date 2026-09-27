import { BusinessRuleError } from "@repo/core/domain/error";
import { ApplicationErrorCode } from "./errorCode";
import type { PremiseKey } from "./premise";
import type { RejectionReason, ReturnReply, ReturnRequest } from "./texts";

/**
 * Whether a decision was taken as the approver or by an operator standing
 * in once the review period elapsed (期間超過の代行). An operator standing
 * in for an absent steward (不在の代行) is the approver.
 */
export type ReviewAs = "approver" | "overdue_proxy";

export const REVIEW_AS = [
  "approver",
  "overdue_proxy",
] as const satisfies readonly ReviewAs[];

/** The return a resubmitted application answers, with the applicant's reply. */
export type Answering = Readonly<{
  request: ReturnRequest;
  reply: ReturnReply | null;
}>;

/**
 * Awaiting the approver. `since` is when it became under review (submission
 * or resubmission): the review period and the review desk's order count
 * from it. `answering` is `null` on a first submission.
 */
export type UnderReviewStatus = Readonly<{
  kind: "underReview";
  since: Date;
  answering: Answering | null;
}>;

export type ReturnedStatus = Readonly<{
  kind: "returned";
  request: ReturnRequest;
}>;

export type ActiveStatus = UnderReviewStatus | ReturnedStatus;

export type WithdrawnStatus = Readonly<{ kind: "withdrawn" }>;

/** Decisions of a kind whose approver seat is a steward's (region, occasion). */
export type StewardSeatDecision =
  | Readonly<{ kind: "approved"; reviewAs: ReviewAs }>
  | Readonly<{ kind: "rejected"; reason: RejectionReason; reviewAs: ReviewAs }>;

/** Decisions of a kind whose approver seat is the operators'. */
export type OperatorSeatDecision =
  | Readonly<{ kind: "approved" }>
  | Readonly<{ kind: "rejected"; reason: RejectionReason }>;

export type LapsedStatus<P extends PremiseKey> = Readonly<{
  kind: "lapsed";
  brokenPremises: readonly [P, ...P[]];
}>;

/** Every status shape any kind can take. */
export type AnyApplicationStatus =
  | ActiveStatus
  | StewardSeatDecision
  | OperatorSeatDecision
  | WithdrawnStatus
  | LapsedStatus<PremiseKey>;

export type ApplicationStatusKind = AnyApplicationStatus["kind"];

export const APPLICATION_STATUS_KINDS = [
  "underReview",
  "returned",
  "approved",
  "rejected",
  "withdrawn",
  "lapsed",
] as const satisfies readonly ApplicationStatusKind[];

export const ACTIVE_STATUS_KINDS = [
  "underReview",
  "returned",
] as const satisfies readonly ApplicationStatusKind[];

type ClosedKind = "rejected" | "withdrawn" | "lapsed";

type HasStatus = Readonly<{ status: AnyApplicationStatus }>;

/** `A` narrowed to its under-review state; distributes over a union of kinds. */
export type UnderReview<A extends HasStatus> = A extends unknown
  ? A & Readonly<{ status: UnderReviewStatus }>
  : never;

export type Returned<A extends HasStatus> = A extends unknown
  ? A & Readonly<{ status: ReturnedStatus }>
  : never;

/** Under review or returned (進行中). */
export type Active<A extends HasStatus> = A extends unknown
  ? A & Readonly<{ status: ActiveStatus }>
  : never;

/** Rejected, withdrawn or lapsed: a reapplication can start from it. */
export type Closed<A extends HasStatus> = A extends unknown
  ? A & Readonly<{ status: Extract<A["status"], { kind: ClosedKind }> }>
  : never;

/**
 * The code of the current status for a refused operation — the only place
 * the status ↔ code table lives. It tells an operation someone else
 * finished first (approved, rejected, withdrawn, resubmitted, returned)
 * from one that lapsed on a broken premise.
 */
const STATUS_CODES = {
  underReview: ApplicationErrorCode.UnderReview,
  returned: ApplicationErrorCode.Returned,
  approved: ApplicationErrorCode.AlreadyApproved,
  rejected: ApplicationErrorCode.AlreadyRejected,
  withdrawn: ApplicationErrorCode.AlreadyWithdrawn,
  lapsed: ApplicationErrorCode.AlreadyLapsed,
} as const satisfies Readonly<
  Record<ApplicationStatusKind, ApplicationErrorCode>
>;

export type StatusCode = (typeof STATUS_CODES)[ApplicationStatusKind];

const refuse = (kind: ApplicationStatusKind): BusinessRuleError<StatusCode> =>
  new BusinessRuleError(
    STATUS_CODES[kind],
    `The application is ${kind} and cannot take this operation`,
  );

const isActiveKind = (kind: ApplicationStatusKind): boolean =>
  kind === "underReview" || kind === "returned";

const isClosedKind = (kind: ApplicationStatusKind): kind is ClosedKind =>
  kind === "rejected" || kind === "withdrawn" || kind === "lapsed";

function requireUnderReview<A extends HasStatus>(app: A): UnderReview<A> {
  if (app.status.kind !== "underReview") throw refuse(app.status.kind);
  return app as UnderReview<A>;
}

function requireReturned<A extends HasStatus>(app: A): Returned<A> {
  if (app.status.kind !== "returned") throw refuse(app.status.kind);
  return app as Returned<A>;
}

function requireActive<A extends HasStatus>(app: A): Active<A> {
  if (!isActiveKind(app.status.kind)) throw refuse(app.status.kind);
  return app as Active<A>;
}

function requireClosed<A extends HasStatus>(app: A): Closed<A> {
  if (!isClosedKind(app.status.kind)) throw refuse(app.status.kind);
  return app as Closed<A>;
}

/**
 * The status guards usecases run before an operation; they hand back the
 * application narrowed to the state the behaviour takes.
 */
export const ApplicationStatus = {
  kinds: APPLICATION_STATUS_KINDS,
  activeKinds: ACTIVE_STATUS_KINDS,
  isActive: (status: AnyApplicationStatus): status is ActiveStatus =>
    isActiveKind(status.kind),
  codeOf: (kind: ApplicationStatusKind): StatusCode => STATUS_CODES[kind],
  requireUnderReview,
  requireReturned,
  requireActive,
  requireClosed,
};
