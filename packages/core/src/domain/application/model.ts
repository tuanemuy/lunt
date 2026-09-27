import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  EventDraft,
  WithEventDrafts,
} from "@repo/core/domain/common/event";
import {
  type AccountId,
  ApplicationId,
  type PhotoId,
} from "@repo/core/domain/common/ids";
import { PhotosReleasedEvent } from "@repo/core/domain/common/photoEvents";
import { ContentRef } from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { type ActingApplicant, Applicant } from "./applicant";
import type { ApproverSeat } from "./approverSeat";
import { canonicalKey } from "./canonical";
import { ApplicationErrorCode } from "./errorCode";
import {
  type ApplicationApprovedEvent,
  ApplicationEvents,
  type ApplicationLapsedEvent,
  type ApplicationRejectedEvent,
  type ApplicationResubmittedEvent,
  type ApplicationReturnedEvent,
  type ApplicationReviewPeriodElapsedEvent,
  type ApplicationSubmittedEvent,
  type ApplicationWithdrawnEvent,
} from "./events";
import type {
  AnyApplication,
  ApplicationCaseIn,
  ApplicationFor,
  ApplicationIn,
  AppointingIn,
  ApproverFactsFor,
  ContentFor,
  ContentName,
  DesiredFor,
  FactsFor,
  JsonValue,
  KindDefinition,
  KindMap,
  KindName,
  KindRegistry,
  KindSpec,
  OpenPermissionFor,
  PremiseKeyFor,
  PremiseResultFor,
  RequestIn,
  ReservedFor,
  ReviewAsFor,
  ReviewPermission,
  ReviewPermissionFor,
  SlotBase,
  SlotIn,
  SpecOfApp,
  SpecOfTarget,
  TargetBase,
  TargetIn,
} from "./kind";
import type { OverdueNotice } from "./overdueNotice";
import {
  PREMISE_KEYS,
  type PremiseCode,
  type PremiseHolds,
  type PremiseKey,
  type PremiseResult,
  PremiseRules,
} from "./premise";
import { ReviewPolicy } from "./reviewPolicy";
import {
  type Active,
  type AnyApplicationStatus,
  ApplicationStatus,
  REVIEW_AS,
  type Returned,
  type ReviewAs,
  type UnderReview,
} from "./status";
import type {
  ApplicationSubject,
  ContentSubject,
  NamedSubject,
  SubmissionTarget,
} from "./subject";
import { RejectionReason, ReturnReply, ReturnRequest } from "./texts";

declare const admissionBrand: unique symbol;

/**
 * Proof that a new application's target passed the submission checks
 * (premises, viewable targets, no active application in its slot). Only
 * `SubmissionScope.admit` makes one, and `Application.submit` demands it.
 */
export type Admission<T extends TargetBase> = Readonly<{
  target: T;
  premise: PremiseHolds;
  readonly [admissionBrand]: true;
}>;

/** The facts a usecase read to decide whether a new application is accepted. */
export type SubmissionFindings = Readonly<{
  premise: PremiseResult;
  /** Among `SubmissionScope.targets`, those the applicant cannot view. */
  unviewable: readonly SubmissionTarget[];
  /** The active application in the same slot (`findActiveBySlot`). */
  activeDuplicate: ApplicationId | null;
}>;

/** A stored status, every field not of its kind `null`. */
export type StatusSnapshot = Readonly<{
  kind: string;
  since: Date | null;
  answering: Readonly<{ request: string; reply: string | null }> | null;
  request: string | null;
  reviewAs: string | null;
  reason: string | null;
  brokenPremises: readonly string[] | null;
}>;

/** An application as stored: the kind's case snapshot plus the core's fields. */
export type ApplicationSnapshot = Readonly<{
  id: string;
  kind: string;
  case: JsonValue;
  status: StatusSnapshot;
  submittedAt: Date;
  version: number;
}>;

export type SubmitParams<S extends KindSpec, T extends TargetBase> = Readonly<{
  id: ApplicationId;
  admission: Admission<T>;
  reserved: ReservedFor<S>;
  content: ContentFor<S>;
}> &
  DesiredFor<S>;

export type Amendment<S extends KindSpec> = Readonly<{
  content: ContentFor<S>;
  reply: ReturnReply | null;
}> &
  DesiredFor<S>;

export type WithClaimedPhotos = Readonly<{
  claimedPhotoIds: readonly PhotoId[];
}>;

/** The appointee of an approved stewardship claim. */
export type ApplicantAccount = Readonly<{
  accountId: AccountId;
  email: EmailAddress;
}>;

/** A case of any registered kind, or an application of any kind. */
type AnyCaseIn<M extends KindMap> = ApplicationCaseIn<M> | AnyApplication;

type OverdueDetection = Readonly<{
  notice: OverdueNotice;
  eventDrafts: readonly EventDraft<ApplicationReviewPeriodElapsedEvent>[];
}>;

/**
 * The Application domain bound to the kinds of `M`
 * (`spec/domains/application.md`). Kind-agnostic readers (`isHandledBy`,
 * `subjects`, `approverSeat`, `namedSubjects`, …) take `AnyApplication`,
 * so code that works on every kind type-checks against a real shape even
 * while no kind is registered; behaviours that depend on a kind's types
 * take the precise application.
 */
export type ApplicationModel<M extends KindMap> = Readonly<{
  /**
   * The aggregate's behaviours (「Application（集約）」). All pure; every
   * change advances the version by one. Behaviours limited to a status
   * take the application narrowed by the matching `require…` guard.
   */
  Application: Readonly<{
    /** Validates the built case against its kind before creating it. */
    submit<T extends TargetIn<M>>(
      params: SubmitParams<SpecOfTarget<M, T>, T>,
      now: Date,
    ): WithEventDrafts<
      UnderReview<ApplicationFor<SpecOfTarget<M, T>>>,
      ApplicationSubmittedEvent
    > &
      WithClaimedPhotos;
    matchesSubmission(app: ApplicationIn<M>, request: RequestIn<M>): boolean;
    requireUnderReview: typeof ApplicationStatus.requireUnderReview;
    requireReturned: typeof ApplicationStatus.requireReturned;
    requireActive: typeof ApplicationStatus.requireActive;
    requireClosed: typeof ApplicationStatus.requireClosed;
    sendBack<A extends UnderReview<ApplicationIn<M>>>(
      app: A,
      as: "approver",
      request: ReturnRequest,
      now: Date,
    ): WithEventDrafts<
      Returned<ApplicationFor<SpecOfApp<M, A>>>,
      ApplicationReturnedEvent
    >;
    resubmit<A extends Returned<ApplicationIn<M>>>(
      app: A,
      amended: Amendment<SpecOfApp<M, A>>,
      premise: PremiseHolds,
      now: Date,
    ): WithEventDrafts<
      UnderReview<ApplicationFor<SpecOfApp<M, A>>>,
      ApplicationResubmittedEvent | PhotosReleasedEvent
    > &
      WithClaimedPhotos;
    approve<A extends UnderReview<ApplicationIn<M>>>(
      app: A,
      as: ReviewAsFor<SpecOfApp<M, A>>,
      premise: PremiseHolds,
      now: Date,
    ): WithEventDrafts<
      ApplicationFor<SpecOfApp<M, A>>,
      ApplicationApprovedEvent
    >;
    reject<A extends UnderReview<ApplicationIn<M>>>(
      app: A,
      as: ReviewAsFor<SpecOfApp<M, A>>,
      reason: RejectionReason,
      now: Date,
    ): WithEventDrafts<
      ApplicationFor<SpecOfApp<M, A>>,
      ApplicationRejectedEvent
    >;
    withdraw<A extends Active<ApplicationIn<M>>>(
      app: A,
      now: Date,
    ): WithEventDrafts<
      ApplicationFor<SpecOfApp<M, A>>,
      ApplicationWithdrawnEvent
    >;
    /** `result` must be `Premise.evaluate` of the application's own target. */
    reassess<A extends Active<ApplicationIn<M>>>(
      app: A,
      result: PremiseResultFor<SpecOfApp<M, A>>,
      now: Date,
    ): WithEventDrafts<ApplicationFor<SpecOfApp<M, A>>, ApplicationLapsedEvent>;
    isHandledBy(app: AnyApplication, acting: ActingApplicant): boolean;
    /**
     * The appointee of an approved stewardship claim: the applicant's
     * account as a usecase read it. `null` (the applicant withdrew) refuses
     * with `APPLICATION_APPLICANT_WITHDRAWN`; the claim stays under review
     * until the withdrawal's consumer withdraws it. Only kinds whose
     * approval appoints the applicant.
     */
    requireApplicantAccount(
      app: AppointingIn<M>,
      account: ApplicantAccount | null,
    ): ApplicantAccount;
    /** The kind of any application; throws for a kind not registered here. */
    kindOf(app: AnyApplication): KindName<M>;
    slotOf(app: ApplicationIn<M>): SlotIn<M> | null;
    subjects(c: AnyCaseIn<M>): readonly ApplicationSubject[];
    approverSeat(app: AnyApplication): ApproverSeat;
    reflectedRef(c: AnyCaseIn<M>): ContentRef;
    /** The companion registration to read for `namedSubjects`, or `null`. */
    registrationOf(app: AnyApplication): ApplicationId | null;
    /**
     * The content subjects with how each is named and whether it does not
     * exist yet (「申請の対象の名称」「まだない対象」). `registration` is the
     * application `registrationOf` names, as read (`null` if not read or
     * not found: its place is then named by the directory).
     */
    namedSubjects(
      app: AnyApplication,
      registration: AnyApplication | null,
    ): readonly NamedSubject[];
    snapshot(app: ApplicationIn<M>): ApplicationSnapshot;
    /** Throws `RehydrationError` on anything invalid. */
    reconstruct(stored: ApplicationSnapshot): ApplicationIn<M>;
  }>;
  ApplicationCase: Readonly<{
    ownedPhotoIds(c: AnyCaseIn<M>): readonly PhotoId[];
    contentNames(c: AnyCaseIn<M>): readonly ContentName[];
  }>;
  ApplicationSlot: Readonly<{
    /** `null` for a kind that creates its target (registration, listing). */
    of(target: TargetIn<M>): SlotIn<M> | null;
    /** One string per slot; equal keys are equal slots. */
    key(slot: SlotIn<M> | SlotBase): string;
    equals(a: SlotIn<M>, b: SlotIn<M>): boolean;
  }>;
  /**
   * The premises of `spec/scenario/index.md` 「申請の前提」 — the one place
   * submission, resubmission, approval, reassessment and the eligibility
   * check judge them.
   */
  Premise: Readonly<{
    /** The applying premises, in table order. */
    required<T extends TargetIn<M>>(
      target: T,
    ): readonly PremiseKeyFor<SpecOfTarget<M, T>>[];
    evaluate<T extends TargetIn<M>>(
      target: T,
      facts: FactsFor<SpecOfTarget<M, T>>,
    ): PremiseResultFor<SpecOfTarget<M, T>>;
    /** Throws the first broken premise's code. */
    require(result: PremiseResult): PremiseHolds;
    codeOf(key: PremiseKey): PremiseCode;
  }>;
  /**
   * What a new application (reapplications included) must satisfy: its
   * premises, viewable targets, and no active application in its slot —
   * judged from the target alone, before the content is built.
   */
  SubmissionScope: Readonly<{
    targets(target: TargetIn<M>): readonly SubmissionTarget[];
    accepts(findings: SubmissionFindings): boolean;
    /** Judged in order: premises, viewable targets, duplicates. */
    admit<T extends TargetIn<M>>(
      target: T,
      findings: SubmissionFindings,
    ): Admission<T>;
  }>;
  /**
   * Who may decide an application and how (`spec/domains/index.md`
   * 「申請の判断」). `decide` never throws: usecases throw `ForbiddenError` on
   * `notApprover`. Only the approver returns an application; an overdue
   * proxy approves or rejects (I-13).
   */
  ApproverPolicy: Readonly<{
    seatOf(target: TargetIn<M>): ApproverSeat;
    decide<A extends ApplicationIn<M>>(
      app: A,
      facts: ApproverFactsFor<SpecOfApp<M, A>>,
      policy: ReviewPolicy,
      now: Date,
    ): ReviewPermissionFor<SpecOfApp<M, A>>;
    reviewAs<A extends UnderReview<ApplicationIn<M>>>(
      app: A,
      permission: OpenPermissionFor<SpecOfApp<M, A>>,
    ): ReviewAsFor<SpecOfApp<M, A>>;
    returnAs<A extends UnderReview<ApplicationIn<M>>>(
      app: A,
      permission: OpenPermissionFor<SpecOfApp<M, A>>,
    ): "approver";
  }>;
  /**
   * Picks the applications whose overdue-review notice is due, once per
   * under-review spell: a steward-seat application under review whose
   * period has elapsed and whose recorded notice (if any) is for an
   * earlier spell. Whether the seat has a steward is the review desk's
   * `asOverdueProxy` filter.
   */
  OverdueReviewWatch: Readonly<{
    detect(
      app: AnyApplication,
      recorded: OverdueNotice | null,
      policy: ReviewPolicy,
      now: Date,
    ): OverdueDetection | null;
  }>;
}>;

// --- The type-erased implementation --------------------------------------
//
// Kind generics cannot be correlated with a runtime kind string, so the
// implementation works on the erased shapes below and `ApplicationModel`
// carries the precise types; `createApplicationModel` joins the two once.

type LooseDefinition = KindDefinition<KindSpec>;
type LooseCase = Readonly<{ target: TargetBase; content: unknown }> &
  Readonly<Record<string, unknown>>;
type LooseApp = AnyApplication & LooseCase;
type LooseFacts =
  | Readonly<{
      seat: "steward";
      targetManagement: Readonly<{ allowed: boolean }>;
      serviceOperation: Readonly<{ allowed: boolean }>;
    }>
  | Readonly<{
      seat: "operator";
      serviceOperation: Readonly<{ allowed: boolean }>;
      registration?: AnyApplicationStatus["kind"] | null;
    }>;
type LooseBroken = Readonly<{ holds: false; broken: readonly PremiseKey[] }>;
type Changed<E extends ApplicationEventDraftType> = Readonly<{
  entity: LooseApp;
  eventDrafts: readonly EventDraft<E>[];
}>;
type ApplicationEventDraftType =
  | ApplicationSubmittedEvent
  | ApplicationResubmittedEvent
  | PhotosReleasedEvent
  | ApplicationReturnedEvent
  | ApplicationApprovedEvent
  | ApplicationRejectedEvent
  | ApplicationWithdrawnEvent
  | ApplicationLapsedEvent;

const BASE_FIELDS = ["id", "status", "submittedAt", "version"] as const;

function assertHolds(premise: PremiseHolds): void {
  if (premise.holds !== true) throw new Error("A premise proof must hold");
}

function storedDate(value: Date): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid stored date");
  return date;
}

function normalized<T extends string>(
  create: (input: string) => T,
  stored: string,
): T {
  const value = create(stored);
  if (value !== stored) throw new Error("Stored text is not normalized");
  return value;
}

const isPremiseKey = (key: string): key is PremiseKey =>
  (PREMISE_KEYS as readonly string[]).includes(key);

/** The case part of an application: everything but the core's fields. */
function caseOf(app: LooseApp): LooseCase {
  const c: Record<string, unknown> = { ...app };
  for (const field of BASE_FIELDS) delete c[field];
  return c as LooseCase;
}

const NOT_APPROVER: ReviewPermission = {
  allowed: false,
  reason: "notApprover",
};

function looseModel(definitions: ReadonlyMap<string, LooseDefinition>) {
  const definitionOf = (kind: string): LooseDefinition => {
    const definition = definitions.get(kind);
    if (definition === undefined) {
      throw new Error(`Unknown application kind: ${kind}`);
    }
    return definition;
  };

  /**
   * The case exactly as its kind stores it: round-trips through the kind's
   * snapshot and reconstruct, so value objects and invariants (a steward's
   * application names its own place, …) are checked on write, and refuses
   * fields the kind does not have.
   */
  function checkedCase(built: LooseCase): LooseCase {
    const definition = definitionOf(built.target.kind);
    let rebuilt: LooseCase;
    try {
      rebuilt = definition.reconstruct(definition.snapshot(built)) as LooseCase;
    } catch (error) {
      throw new Error(`A ${built.target.kind} case violates its kind`, {
        cause: error,
      });
    }
    const fields = (c: LooseCase) => Object.keys(c).sort().join(",");
    if (
      fields(rebuilt) !== fields(built) ||
      canonicalKey(definition.snapshot(rebuilt)) !==
        canonicalKey(definition.snapshot(built))
    ) {
      throw new Error(
        `A ${built.target.kind} case carries fields its kind does not have`,
      );
    }
    return rebuilt;
  }

  const required = (target: TargetBase): readonly PremiseKey[] =>
    PremiseRules.required(definitionOf(target.kind).premises, target);

  const seatOf = (target: TargetBase): ApproverSeat =>
    definitionOf(target.kind).seatOf(target);

  const photoOwner = (id: ApplicationId) =>
    ({ kind: "application", id }) as const;

  function decide(
    app: LooseApp,
    facts: LooseFacts,
    policy: ReviewPolicy,
    now: Date,
  ): ReviewPermission {
    if (definitionOf(app.target.kind).seat !== facts.seat) {
      throw new Error(`Approver facts for a ${facts.seat} seat`);
    }
    if (facts.seat === "operator") {
      if (!facts.serviceOperation.allowed) return NOT_APPROVER;
      if (
        facts.registration === "underReview" ||
        facts.registration === "returned"
      ) {
        return { allowed: false, reason: "registrationPending" };
      }
      return { allowed: true, reviewAs: "approver" };
    }
    if (facts.targetManagement.allowed) {
      return { allowed: true, reviewAs: "approver" };
    }
    if (!facts.serviceOperation.allowed) return NOT_APPROVER;
    const { status } = app;
    return status.kind === "underReview" &&
      ReviewPolicy.proxyableAt({ status }, policy).getTime() <= now.getTime()
      ? { allowed: true, reviewAs: "overdue_proxy" }
      : { allowed: false, reason: "awaitingStewards" };
  }

  function reviewAs(app: LooseApp, permission: ReviewPermission): ReviewAs {
    if (app.status.kind !== "underReview") {
      throw new Error("Only an under-review application is decided");
    }
    if (permission.allowed) return permission.reviewAs;
    if (permission.reason === "awaitingStewards") {
      throw new BusinessRuleError(
        ApplicationErrorCode.AwaitingStewards,
        "The stewards' review period has not elapsed",
      );
    }
    if (permission.reason === "registrationPending") {
      throw new BusinessRuleError(
        ApplicationErrorCode.RegistrationPending,
        "The companion registration is not decided yet",
      );
    }
    throw new Error("A notApprover permission cannot decide");
  }

  function submit(
    params: Readonly<{
      id: ApplicationId;
      admission: Readonly<{ target: TargetBase; premise: PremiseHolds }>;
      reserved: object;
      content: unknown;
    }>,
    now: Date,
  ): Changed<ApplicationSubmittedEvent> & WithClaimedPhotos {
    const { id, admission, reserved, content, ...desired } = params;
    assertHolds(admission.premise);
    const definition = definitionOf(admission.target.kind);
    const entity: LooseApp = {
      id,
      ...checkedCase({
        target: admission.target,
        ...reserved,
        content,
        ...desired,
      }),
      status: { kind: "underReview", since: now, answering: null },
      submittedAt: now,
      version: Version.initial(),
    };
    return {
      entity,
      eventDrafts: [
        ApplicationEvents.submitted(id, definition.seatOf(entity.target), now),
      ],
      claimedPhotoIds: definition.ownedPhotoIds(entity),
    };
  }

  function sendBack(
    app: LooseApp,
    _as: "approver",
    request: ReturnRequest,
    now: Date,
  ): Changed<ApplicationReturnedEvent> {
    const current = ApplicationStatus.requireUnderReview(app);
    return {
      entity: {
        ...current,
        status: { kind: "returned", request },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.returned(current.id, current.target.applicant, now),
      ],
    };
  }

  function resubmit(
    app: LooseApp,
    amended: Readonly<{ content: unknown; reply: ReturnReply | null }>,
    premise: PremiseHolds,
    now: Date,
  ): Changed<ApplicationResubmittedEvent | PhotosReleasedEvent> &
    WithClaimedPhotos {
    assertHolds(premise);
    const current = ApplicationStatus.requireReturned(app);
    const { request } = current.status;
    const { content, reply, ...desired } = amended;
    const definition = definitionOf(current.target.kind);
    const entity: LooseApp = {
      ...current,
      ...checkedCase({ ...caseOf(current), content, ...desired }),
      status: {
        kind: "underReview",
        since: now,
        answering: { request, reply },
      },
      version: Version.next(current.version),
    };
    const before = definition.ownedPhotoIds(current);
    const after = definition.ownedPhotoIds(entity);
    const released = before.filter((photo) => !after.includes(photo));
    const eventDrafts: EventDraft<
      ApplicationResubmittedEvent | PhotosReleasedEvent
    >[] = [
      ApplicationEvents.resubmitted(
        current.id,
        definition.seatOf(current.target),
        now,
      ),
      ...PhotosReleasedEvent.draftsFor(photoOwner(current.id), released, now),
    ];
    return {
      entity,
      eventDrafts,
      claimedPhotoIds: after.filter((photo) => !before.includes(photo)),
    };
  }

  function decisionStatus(
    app: LooseApp,
    as: ReviewAs,
    outcome:
      | Readonly<{ kind: "approved" }>
      | Readonly<{ kind: "rejected"; reason: RejectionReason }>,
  ): AnyApplicationStatus {
    if (definitionOf(app.target.kind).seat === "steward") {
      return { ...outcome, reviewAs: as };
    }
    if (as !== "approver") {
      throw new Error("An operator-seat kind has no overdue proxy");
    }
    return outcome;
  }

  function approve(
    app: LooseApp,
    as: ReviewAs,
    premise: PremiseHolds,
    now: Date,
  ): Changed<ApplicationApprovedEvent> {
    assertHolds(premise);
    const current = ApplicationStatus.requireUnderReview(app);
    return {
      entity: {
        ...current,
        status: decisionStatus(current, as, { kind: "approved" }),
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.approved(current.id, current.target.applicant, now),
      ],
    };
  }

  function reject(
    app: LooseApp,
    as: ReviewAs,
    reason: RejectionReason,
    now: Date,
  ): Changed<ApplicationRejectedEvent> {
    const current = ApplicationStatus.requireUnderReview(app);
    return {
      entity: {
        ...current,
        status: decisionStatus(current, as, { kind: "rejected", reason }),
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.rejected(current.id, current.target.applicant, now),
      ],
    };
  }

  function withdraw(
    app: LooseApp,
    now: Date,
  ): Changed<ApplicationWithdrawnEvent> {
    const current = ApplicationStatus.requireActive(app);
    return {
      entity: {
        ...current,
        status: { kind: "withdrawn" },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.withdrawn(current.id, seatOf(current.target), now),
      ],
    };
  }

  function reassess(
    app: LooseApp,
    result: PremiseHolds | LooseBroken,
    now: Date,
  ): Changed<ApplicationLapsedEvent> {
    const current = ApplicationStatus.requireActive(app);
    if (result.holds) return { entity: current, eventDrafts: [] };
    const allowed = required(current.target);
    const [first, ...rest] = result.broken;
    if (
      first === undefined ||
      new Set(result.broken).size !== result.broken.length ||
      result.broken.some((key) => !allowed.includes(key))
    ) {
      throw new Error(
        `Broken premises ${result.broken.join(", ")} are not the premises of this ${current.target.kind}`,
      );
    }
    return {
      entity: {
        ...current,
        status: { kind: "lapsed", brokenPremises: [first, ...rest] },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.lapsed(current.id, current.target.applicant, now),
      ],
    };
  }

  function requireApplicantAccount(
    app: LooseApp,
    account: ApplicantAccount | null,
  ): ApplicantAccount {
    const { applicant, kind } = app.target;
    if (!definitionOf(kind).appointsApplicant) {
      throw new Error(`A ${kind} does not appoint its applicant`);
    }
    if (account === null) {
      throw new BusinessRuleError(
        ApplicationErrorCode.ApplicantWithdrawn,
        "The applicant has withdrawn",
      );
    }
    if (
      applicant.kind !== "individual" ||
      account.accountId !== applicant.accountId
    ) {
      throw new Error("The account read is not the applicant's");
    }
    return { accountId: account.accountId, email: account.email };
  }

  function namedSubjects(
    app: LooseApp,
    registration: LooseApp | null,
  ): readonly NamedSubject[] {
    const registrationId = definitionOf(app.target.kind).registrationOf(
      app.target,
    );
    if (registration !== null && registration.id !== registrationId) {
      throw new Error("The registration read is not the one filed with");
    }
    const sources = registration === null ? [app] : [app, registration];
    const nameOf = (subject: ContentSubject): NamedSubject => {
      for (const source of sources) {
        const definition = definitionOf(source.target.kind);
        const named = definition
          .contentNames(source)
          .find((entry) => ContentRef.equals(entry.ref, subject));
        if (named !== undefined) {
          return {
            subject,
            name: { from: "content", value: named.name },
            notYet:
              source.status.kind !== "approved" &&
              ContentRef.equals(definition.reflectedRef(source), subject),
          };
        }
      }
      return { subject, name: { from: "directory" }, notYet: false };
    };
    return definitionOf(app.target.kind)
      .subjects(app)
      .flatMap((subject) =>
        subject.kind === "registration" ? [] : [nameOf(subject)],
      );
  }

  function snapshotStatus(status: AnyApplicationStatus): StatusSnapshot {
    const empty: StatusSnapshot = {
      kind: status.kind,
      since: null,
      answering: null,
      request: null,
      reviewAs: null,
      reason: null,
      brokenPremises: null,
    };
    switch (status.kind) {
      case "underReview":
        return { ...empty, since: status.since, answering: status.answering };
      case "returned":
        return { ...empty, request: status.request };
      case "approved":
        return {
          ...empty,
          reviewAs: "reviewAs" in status ? status.reviewAs : null,
        };
      case "rejected":
        return {
          ...empty,
          reason: status.reason,
          reviewAs: "reviewAs" in status ? status.reviewAs : null,
        };
      case "withdrawn":
        return empty;
      case "lapsed":
        return { ...empty, brokenPremises: status.brokenPremises };
    }
  }

  function snapshot(app: LooseApp): ApplicationSnapshot {
    return {
      id: app.id,
      kind: app.target.kind,
      case: definitionOf(app.target.kind).snapshot(caseOf(app)),
      status: snapshotStatus(app.status),
      submittedAt: app.submittedAt,
      version: app.version,
    };
  }

  function reconstructStatus(
    stored: StatusSnapshot,
    definition: LooseDefinition,
    target: TargetBase,
  ): AnyApplicationStatus {
    const only = (...fields: readonly (keyof StatusSnapshot)[]): void => {
      for (const field of [
        "since",
        "answering",
        "request",
        "reviewAs",
        "reason",
        "brokenPremises",
      ] as const) {
        if (!fields.includes(field) && stored[field] !== null) {
          throw new Error(`A ${stored.kind} status has ${field}`);
        }
      }
    };
    const reviewAsOf = (): ReviewAs | null => {
      if (definition.seat === "operator") {
        if (stored.reviewAs !== null) {
          throw new Error("An operator-seat decision has reviewAs");
        }
        return null;
      }
      const value = REVIEW_AS.find((as) => as === stored.reviewAs);
      if (value === undefined) {
        throw new Error("A steward-seat decision lacks reviewAs");
      }
      return value;
    };
    switch (stored.kind) {
      case "underReview": {
        only("since", "answering");
        if (stored.since === null) throw new Error("No since");
        const { answering } = stored;
        return {
          kind: "underReview",
          since: storedDate(stored.since),
          answering:
            answering === null
              ? null
              : {
                  request: normalized(ReturnRequest.create, answering.request),
                  reply:
                    answering.reply === null
                      ? null
                      : normalized(ReturnReply.create, answering.reply),
                },
        };
      }
      case "returned": {
        only("request");
        if (stored.request === null) throw new Error("No request");
        return {
          kind: "returned",
          request: normalized(ReturnRequest.create, stored.request),
        };
      }
      case "approved": {
        only("reviewAs");
        const as = reviewAsOf();
        return as === null
          ? { kind: "approved" }
          : { kind: "approved", reviewAs: as };
      }
      case "rejected": {
        only("reason", "reviewAs");
        if (stored.reason === null) throw new Error("No reason");
        const reason = normalized(RejectionReason.create, stored.reason);
        const as = reviewAsOf();
        return as === null
          ? { kind: "rejected", reason }
          : { kind: "rejected", reason, reviewAs: as };
      }
      case "withdrawn":
        only();
        return { kind: "withdrawn" };
      case "lapsed": {
        only("brokenPremises");
        const allowed = PremiseRules.required(definition.premises, target);
        const broken = (stored.brokenPremises ?? []).filter(isPremiseKey);
        const [first, ...rest] = broken;
        if (
          first === undefined ||
          broken.length !== stored.brokenPremises?.length ||
          new Set(broken).size !== broken.length ||
          broken.some((key) => !allowed.includes(key))
        ) {
          throw new Error("Broken premises outside the kind's premises");
        }
        return { kind: "lapsed", brokenPremises: [first, ...rest] };
      }
      default:
        throw new Error(`Unknown status: ${stored.kind}`);
    }
  }

  function reconstruct(stored: ApplicationSnapshot): LooseApp {
    try {
      const definition = definitionOf(stored.kind);
      const c = definition.reconstruct(stored.case) as LooseCase;
      if (c.target.kind !== stored.kind) {
        throw new Error(`A ${stored.kind} holds a ${c.target.kind} target`);
      }
      return {
        ...c,
        id: ApplicationId.create(stored.id),
        status: reconstructStatus(stored.status, definition, c.target),
        submittedAt: storedDate(stored.submittedAt),
        version: Version.create(stored.version),
      };
    } catch (error) {
      throw new RehydrationError(
        "Stored application violates invariants",
        error,
      );
    }
  }

  function detect(
    app: LooseApp,
    recorded: OverdueNotice | null,
    policy: ReviewPolicy,
    now: Date,
  ): OverdueDetection | null {
    const { status } = app;
    if (status.kind !== "underReview") return null;
    if (definitionOf(app.target.kind).seat !== "steward") return null;
    if (
      ReviewPolicy.proxyableAt({ status }, policy).getTime() > now.getTime()
    ) {
      return null;
    }
    if (recorded?.pendingSince.getTime() === status.since.getTime()) {
      return null;
    }
    return {
      notice: { applicationId: app.id, pendingSince: status.since },
      eventDrafts: [
        ApplicationEvents.reviewPeriodElapsed(app.id, status.since, now),
      ],
    };
  }

  return {
    Application: {
      submit,
      matchesSubmission: (
        app: LooseApp,
        request: Readonly<{ target: TargetBase }>,
      ): boolean =>
        app.target.kind === request.target.kind &&
        definitionOf(app.target.kind).matchesSubmission(app, request),
      requireUnderReview: ApplicationStatus.requireUnderReview,
      requireReturned: ApplicationStatus.requireReturned,
      requireActive: ApplicationStatus.requireActive,
      requireClosed: ApplicationStatus.requireClosed,
      sendBack,
      resubmit,
      approve,
      reject,
      withdraw,
      reassess,
      isHandledBy: (app: LooseApp, acting: ActingApplicant): boolean =>
        Applicant.isHandledBy(app.target.applicant, acting),
      requireApplicantAccount,
      kindOf: (app: LooseApp): string => definitionOf(app.target.kind).kind,
      slotOf: (app: LooseApp): SlotBase | null =>
        definitionOf(app.target.kind).slotOf(app.target),
      subjects: (c: LooseCase): readonly ApplicationSubject[] =>
        definitionOf(c.target.kind).subjects(c),
      approverSeat: (app: LooseApp): ApproverSeat => seatOf(app.target),
      reflectedRef: (c: LooseCase): ContentRef =>
        definitionOf(c.target.kind).reflectedRef(c),
      registrationOf: (app: LooseApp): ApplicationId | null =>
        definitionOf(app.target.kind).registrationOf(app.target),
      namedSubjects,
      snapshot,
      reconstruct,
    },
    ApplicationCase: {
      ownedPhotoIds: (c: LooseCase): readonly PhotoId[] =>
        definitionOf(c.target.kind).ownedPhotoIds(c),
      contentNames: (c: LooseCase): readonly ContentName[] =>
        definitionOf(c.target.kind).contentNames(c),
    },
    ApplicationSlot: {
      of: (target: TargetBase): SlotBase | null =>
        definitionOf(target.kind).slotOf(target),
      key: (slot: SlotBase): string => canonicalKey(slot),
      equals: (a: SlotBase, b: SlotBase): boolean =>
        canonicalKey(a) === canonicalKey(b),
    },
    Premise: {
      required,
      evaluate: (target: TargetBase, facts: object): PremiseResult =>
        PremiseRules.evaluate(
          definitionOf(target.kind).premises,
          target,
          facts,
        ),
      require: PremiseRules.require,
      codeOf: PremiseRules.codeOf,
    },
    SubmissionScope: {
      targets: (target: TargetBase): readonly SubmissionTarget[] =>
        definitionOf(target.kind).submissionTargets(target),
      accepts: (findings: SubmissionFindings): boolean =>
        findings.premise.holds &&
        findings.unviewable.length === 0 &&
        findings.activeDuplicate === null,
      admit: (target: TargetBase, findings: SubmissionFindings) => {
        const premise = PremiseRules.require(findings.premise);
        if (findings.unviewable.length > 0) {
          throw new BusinessRuleError(
            ApplicationErrorCode.TargetNotViewable,
            "A target of the application is not viewable",
          );
        }
        if (findings.activeDuplicate !== null) {
          throw new BusinessRuleError(
            ApplicationErrorCode.AlreadyActive,
            "An active application of the same slot exists",
          );
        }
        return { target, premise };
      },
    },
    ApproverPolicy: {
      seatOf,
      decide,
      reviewAs,
      returnAs: (app: LooseApp, permission: ReviewPermission): "approver" => {
        if (reviewAs(app, permission) === "overdue_proxy") {
          throw new BusinessRuleError(
            ApplicationErrorCode.OverdueProxyCannotReturn,
            "An overdue proxy cannot return an application",
          );
        }
        return "approver";
      },
    },
    OverdueReviewWatch: { detect },
  };
}

/** The model with its kind types erased: what kind-generic tooling drives. */
export type ErasedApplicationModel = ReturnType<typeof looseModel>;

/** The same model, typed for code generic over every kind (contract suites). */
export function eraseKinds<M extends KindMap>(
  model: ApplicationModel<M>,
): ErasedApplicationModel {
  return model as unknown as ErasedApplicationModel;
}

/**
 * Binds the kind-agnostic core to a registry of kind definitions.
 * `domain/application/application.ts` binds it to the production kinds;
 * tests bind it to test-only kinds.
 */
export function createApplicationModel<M extends KindMap>(
  registry: KindRegistry<M>,
): ApplicationModel<M> {
  const definitions = new Map<string, LooseDefinition>();
  for (const [name, definition] of Object.entries(
    registry as Readonly<Record<string, LooseDefinition>>,
  )) {
    if (definition.kind !== name) {
      throw new Error(`Kind ${definition.kind} is registered as ${name}`);
    }
    const keys = definition.premises.map((rule) => rule.key);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`Kind ${name} declares a premise twice`);
    }
    definitions.set(name, definition);
  }
  return looseModel(definitions) as unknown as ApplicationModel<M>;
}
