import type { Actor } from "@repo/core/domain/common/actor";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import {
  AccountId,
  InfoReportId,
  ListingId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { ModerationErrorCode } from "./errorCode";
import {
  type InfoReportConfirmationRequestedEvent,
  type InfoReportSubmittedEvent,
  ModerationEvents,
} from "./events";
import {
  InfoReportCategory,
  InfoReportContent,
  type InfoReportTarget,
} from "./values";

type InfoReportBase = Readonly<{
  id: InfoReportId;
  target: InfoReportTarget;
  category: InfoReportCategory;
  content: InfoReportContent;
  /** Who reported; points at nothing once they withdraw. */
  reporter: AccountId;
  /** When it was received — when it started awaiting the operators. */
  receivedAt: Date;
  version: Version;
}>;

/** The operators asked the place's stewards to check the report. */
export type ConfirmationRequest = Readonly<{ requestedAt: Date }>;

export type OpenInfoReport = InfoReportBase & Readonly<{ status: "open" }>;

export type ConfirmationRequestedInfoReport = InfoReportBase &
  Readonly<{ status: "confirmationRequested"; request: ConfirmationRequest }>;

export type ResolvedInfoReport = InfoReportBase &
  Readonly<{
    status: "resolved";
    /** Kept from `confirmationRequested`; `null` when resolved without one. */
    request: ConfirmationRequest | null;
  }>;

/**
 * 情報の誤り・閉店の連絡 (`spec/domains/moderation.md` 「InfoReport」): a
 * signed-in user tells the operators that a stewarded place or its listing
 * is wrong or closed. Only the operators change its status; it is never
 * deleted.
 */
export type InfoReport =
  | OpenInfoReport
  | ConfirmationRequestedInfoReport
  | ResolvedInfoReport;

export type InfoReportStatus = InfoReport["status"];

/** What the transport hands `submit`; the value objects check it. */
export type InfoReportInput = Readonly<{
  id: InfoReportId;
  target:
    | Readonly<{ kind: "place"; placeId: PlaceId }>
    | Readonly<{ kind: "listing"; listingId: ListingId }>;
  category: string;
  content: string;
}>;

/**
 * What the usecase read about the target: `unavailable` when the place or
 * listing is missing or not viewable (`VisibilityPolicy` on the aggregates
 * read); otherwise the place reported on (a listing's own place) and
 * whether it has a steward.
 */
export type InfoReportSubmissionFacts =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "available"; placeId: PlaceId; placeHasSteward: boolean }>;

const placeWithoutSteward = () =>
  new BusinessRuleError(
    ModerationErrorCode.InfoReportPlaceWithoutSteward,
    "The place has no steward",
  );

/** The submission's value objects, in the order `submit` checks them. */
function submission(input: InfoReportInput) {
  return {
    category: InfoReportCategory.create(input.category),
    content: InfoReportContent.create(input.content),
  };
}

/**
 * Receives a report as open. Checks, first failure wins: the value objects
 * (category, content), the target is available
 * (`MODERATION_INFO_REPORT_TARGET_UNAVAILABLE`), the place has a steward
 * (`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD` — a place without one
 * takes a revision application instead). A listing target takes its place
 * from `facts.placeId`.
 */
function submit(
  input: InfoReportInput,
  reporter: Actor,
  facts: InfoReportSubmissionFacts,
  now: Date,
): WithEventDrafts<OpenInfoReport, InfoReportSubmittedEvent> {
  const { category, content } = submission(input);
  if (facts.kind === "unavailable") {
    throw new BusinessRuleError(
      ModerationErrorCode.InfoReportTargetUnavailable,
      "The info report's target is not viewable",
    );
  }
  if (!facts.placeHasSteward) throw placeWithoutSteward();
  const target: InfoReportTarget =
    input.target.kind === "place"
      ? { kind: "place", placeId: input.target.placeId }
      : {
          kind: "listing",
          placeId: facts.placeId,
          listingId: input.target.listingId,
        };
  return {
    entity: {
      id: input.id,
      target,
      category,
      content,
      reporter: reporter.accountId,
      receivedAt: now,
      version: Version.initial(),
      status: "open",
    },
    eventDrafts: [ModerationEvents.infoReportSubmitted(input.id, now)],
  };
}

/**
 * Asks the place's stewards to check an open report; it cannot be taken
 * back. `MODERATION_INFO_REPORT_NOT_OPEN` first, then
 * `MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`.
 */
function requestConfirmation(
  report: InfoReport,
  facts: Readonly<{ placeHasSteward: boolean }>,
  now: Date,
): WithEventDrafts<
  ConfirmationRequestedInfoReport,
  InfoReportConfirmationRequestedEvent
> {
  if (report.status !== "open") {
    throw new BusinessRuleError(
      ModerationErrorCode.InfoReportNotOpen,
      "The info report is not open",
    );
  }
  if (!facts.placeHasSteward) throw placeWithoutSteward();
  return {
    entity: {
      ...report,
      status: "confirmationRequested",
      request: { requestedAt: now },
      version: Version.next(report.version),
    },
    eventDrafts: [
      ModerationEvents.infoReportConfirmationRequested(
        report.id,
        report.target,
        now,
      ),
    ],
  };
}

/**
 * Closes an open or confirmation-requested report, keeping its request.
 * No outcome and no event. `MODERATION_INFO_REPORT_ALREADY_RESOLVED` when
 * already resolved.
 */
function resolve(report: InfoReport): ResolvedInfoReport {
  if (report.status === "resolved") {
    throw new BusinessRuleError(
      ModerationErrorCode.InfoReportAlreadyResolved,
      "The info report is already resolved",
    );
  }
  return {
    ...report,
    status: "resolved",
    request: report.status === "confirmationRequested" ? report.request : null,
    version: Version.next(report.version),
  };
}

/** The request stewards may read; `null` when the report never had one. */
function confirmationRequestOf(report: InfoReport): ConfirmationRequest | null {
  return report.status === "open" ? null : report.request;
}

const sameTarget = (
  stored: InfoReportTarget,
  input: InfoReportInput["target"],
): boolean =>
  input.kind === "place"
    ? stored.kind === "place" && stored.placeId === input.placeId
    : stored.kind === "listing" && stored.listingId === input.listingId;

/**
 * Whether `input` from `reporter` resends this report: same reporter,
 * target (kind and place or listing id), category and content. Takes no
 * facts, so a resend after the listing was deleted is still recognised.
 * Input that fails a value object is never the same submission.
 */
function sameSubmission(
  report: InfoReport,
  input: InfoReportInput,
  reporter: Actor,
): boolean {
  let resent: ReturnType<typeof submission>;
  try {
    resent = submission(input);
  } catch (error) {
    if (error instanceof BusinessRuleError) return false;
    throw error;
  }
  return (
    report.reporter === reporter.accountId &&
    sameTarget(report.target, input.target) &&
    report.category === resent.category &&
    report.content === resent.content
  );
}

/** A report at rest: primitives only, the inverse of `reconstruct`. */
export type InfoReportSnapshot = Readonly<{
  id: string;
  target: Readonly<{
    kind: string;
    placeId: string;
    /** `null` for a place target. */
    listingId: string | null;
  }>;
  category: string;
  content: string;
  reporter: string;
  receivedAt: Date;
  status: string;
  /** `null` when the report has no request. */
  requestedAt: Date | null;
  version: number;
}>;

function snapshot(report: InfoReport): InfoReportSnapshot {
  const request = confirmationRequestOf(report);
  return {
    id: report.id,
    target: {
      kind: report.target.kind,
      placeId: report.target.placeId,
      listingId:
        report.target.kind === "listing" ? report.target.listingId : null,
    },
    category: report.category,
    content: report.content,
    reporter: report.reporter,
    receivedAt: report.receivedAt,
    status: report.status,
    requestedAt: request?.requestedAt ?? null,
    version: report.version,
  };
}

function reconstructTarget(
  stored: InfoReportSnapshot["target"],
): InfoReportTarget {
  const placeId = PlaceId.create(stored.placeId);
  if (stored.kind === "place" && stored.listingId === null) {
    return { kind: "place", placeId };
  }
  if (stored.kind === "listing" && stored.listingId !== null) {
    return {
      kind: "listing",
      placeId,
      listingId: ListingId.create(stored.listingId),
    };
  }
  throw new Error(`Invalid info report target kind: ${stored.kind}`);
}

const validDate = (date: Date): Date => {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return date;
};

function reconstruct(stored: InfoReportSnapshot): InfoReport {
  try {
    const content = InfoReportContent.create(stored.content);
    if (content !== stored.content) {
      throw new Error("Stored content is not in its normalized form");
    }
    const base = {
      id: InfoReportId.create(stored.id),
      target: reconstructTarget(stored.target),
      category: InfoReportCategory.create(stored.category),
      content,
      reporter: AccountId.create(stored.reporter),
      receivedAt: validDate(stored.receivedAt),
      version: Version.create(stored.version),
    };
    const request =
      stored.requestedAt === null
        ? null
        : { requestedAt: validDate(stored.requestedAt) };
    switch (stored.status) {
      case "open":
        if (request !== null) throw new Error("An open report has a request");
        return { ...base, status: "open" };
      case "confirmationRequested":
        if (request === null) {
          throw new Error("A confirmation-requested report has no request");
        }
        return { ...base, status: "confirmationRequested", request };
      case "resolved":
        return { ...base, status: "resolved", request };
      default:
        throw new Error(`Unknown info report status: ${stored.status}`);
    }
  } catch (error) {
    throw new RehydrationError("Stored info report violates invariants", error);
  }
}

export const InfoReport = {
  submit,
  requestConfirmation,
  resolve,
  confirmationRequestOf,
  sameSubmission,
  snapshot,
  reconstruct,
};
