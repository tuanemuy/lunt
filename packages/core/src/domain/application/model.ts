import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  EventDraft,
  WithEventDrafts,
} from "@repo/core/domain/common/event";
import {
  AccountId,
  ApplicationId,
  type PhotoId,
} from "@repo/core/domain/common/ids";
import { PhotosReleasedEvent } from "@repo/core/domain/common/photoEvents";
import type { ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import {
  type ActingApplicant,
  Applicant,
  type IndividualApplicant,
} from "./applicant";
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
  ApplicationBase,
  ApplicationCaseIn,
  ApplicationFor,
  ApplicationIn,
  ApproverFactsFor,
  ContentFor,
  DesiredFor,
  FactsFor,
  JsonValue,
  KindDefinition,
  KindMap,
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
import type { ApplicationSubject, SubmissionTarget } from "./subject";
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

type SubmitParams<S extends KindSpec, T extends TargetBase> = Readonly<{
  id: ApplicationId;
  admission: Admission<T>;
  reserved: ReservedFor<S>;
  content: ContentFor<S>;
}> &
  DesiredFor<S>;

type Amendment<S extends KindSpec> = Readonly<{
  content: ContentFor<S>;
  reply: ReturnReply | null;
}> &
  DesiredFor<S>;

type WithClaimedPhotos = Readonly<{ claimedPhotoIds: readonly PhotoId[] }>;

// The erased view the implementation works on: generics cannot be
// correlated with a runtime kind string, so each function goes through
// it and the exported signatures carry the precise types.
type LooseDefinition = KindDefinition<KindSpec>;
type LooseCase = Readonly<{ target: TargetBase; content: unknown }> &
  Readonly<Record<string, unknown>>;
type LooseApp = ApplicationBase &
  LooseCase &
  Readonly<{ status: AnyApplicationStatus }>;
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

const loose = <T>(value: unknown): T => value as T;

function assertHolds(premise: PremiseHolds): void {
  if (premise.holds !== true) {
    throw new Error("A premise proof must hold");
  }
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

/**
 * Binds the kind-agnostic core to a registry of kind definitions.
 * `domain/application/application.ts` binds it to the production kinds;
 * tests bind it to test-only kinds. The result carries the domain objects
 * of `spec/domains/application.md` — `Application`, `ApplicationSlot`,
 * `ApplicationCase`, `Premise`, `SubmissionScope`, `ApproverPolicy`,
 * `OverdueReviewWatch` — typed over the registry's kinds.
 */
export function createApplicationModel<M extends KindMap>(
  registry: KindRegistry<M>,
) {
  type App = ApplicationIn<M>;
  type Target = TargetIn<M>;

  const definitions = new Map<string, LooseDefinition>();
  for (const [name, definition] of Object.entries(
    loose<Readonly<Record<string, LooseDefinition>>>(registry),
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

  const definitionOf = (kind: string): LooseDefinition => {
    const definition = definitions.get(kind);
    if (definition === undefined) {
      throw new Error(`Unknown application kind: ${kind}`);
    }
    return definition;
  };

  // --- Premise ---------------------------------------------------------

  function required<T extends Target>(
    target: T,
  ): readonly PremiseKeyFor<SpecOfTarget<M, T>>[] {
    return loose(
      PremiseRules.required(definitionOf(target.kind).premises, target),
    );
  }

  function evaluate<T extends Target>(
    target: T,
    facts: FactsFor<SpecOfTarget<M, T>>,
  ): PremiseResultFor<SpecOfTarget<M, T>> {
    return loose(
      PremiseRules.evaluate(definitionOf(target.kind).premises, target, facts),
    );
  }

  /**
   * The premises of `spec/scenario/index.md` 「申請の前提」 — the one place
   * submission, resubmission, approval, reassessment and the eligibility
   * check judge them. `required` lists the applying ones in table order,
   * `evaluate` checks them against the facts a usecase read, and `require`
   * throws the first broken one's code.
   */
  const Premise = {
    required,
    evaluate,
    require: PremiseRules.require,
    codeOf: PremiseRules.codeOf,
  };

  // --- SubmissionScope -------------------------------------------------

  function admit<T extends Target>(
    target: T,
    findings: SubmissionFindings,
  ): Admission<T> {
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
    return loose<Admission<T>>({ target, premise });
  }

  /**
   * What a new application (reapplications included) must satisfy: its
   * premises, viewable targets, and no active application in its slot —
   * all judged from the target alone, before the content is built.
   */
  const SubmissionScope = {
    targets: (target: Target): readonly SubmissionTarget[] =>
      definitionOf(target.kind).submissionTargets(target),
    accepts: (findings: SubmissionFindings): boolean =>
      findings.premise.holds &&
      findings.unviewable.length === 0 &&
      findings.activeDuplicate === null,
    /** Judged in order: premises, viewable targets, duplicates. */
    admit,
  };

  // --- ApplicationSlot -------------------------------------------------

  const ApplicationSlot = {
    /** `null` for a kind that creates its target (registration, listing). */
    of: (target: Target): SlotIn<M> | null =>
      loose(definitionOf(target.kind).slotOf(target)),
    /** One string per slot; equal keys are equal slots. */
    key: (slot: SlotIn<M> | SlotBase): string => canonicalKey(slot),
    equals: (a: SlotIn<M>, b: SlotIn<M>): boolean =>
      canonicalKey(a) === canonicalKey(b),
  };

  // --- ApproverPolicy --------------------------------------------------

  const seatOf = (target: Target): ApproverSeat =>
    definitionOf(target.kind).seatOf(target);

  const NOT_APPROVER: ReviewPermission = {
    allowed: false,
    reason: "notApprover",
  };

  function decide<A extends App>(
    app: A,
    facts: ApproverFactsFor<SpecOfApp<M, A>>,
    policy: ReviewPolicy,
    now: Date,
  ): ReviewPermissionFor<SpecOfApp<M, A>> {
    const subject = loose<LooseApp>(app);
    const given = loose<LooseFacts>(facts);
    if (definitionOf(subject.target.kind).seat !== given.seat) {
      throw new Error(`Approver facts for a ${given.seat} seat`);
    }
    const decision = ((): ReviewPermission => {
      if (given.seat === "operator") {
        if (!given.serviceOperation.allowed) return NOT_APPROVER;
        if (
          given.registration === "underReview" ||
          given.registration === "returned"
        ) {
          return { allowed: false, reason: "registrationPending" };
        }
        return { allowed: true, reviewAs: "approver" };
      }
      if (given.targetManagement.allowed) {
        return { allowed: true, reviewAs: "approver" };
      }
      if (given.serviceOperation.allowed) {
        const status = subject.status;
        return status.kind === "underReview" &&
          ReviewPolicy.proxyableAt({ status }, policy).getTime() <=
            now.getTime()
          ? { allowed: true, reviewAs: "overdue_proxy" }
          : { allowed: false, reason: "awaitingStewards" };
      }
      return NOT_APPROVER;
    })();
    return loose(decision);
  }

  function reviewAs<A extends UnderReview<App>>(
    app: A,
    permission: OpenPermissionFor<SpecOfApp<M, A>>,
  ): ReviewAsFor<SpecOfApp<M, A>> {
    if (loose<LooseApp>(app).status.kind !== "underReview") {
      throw new Error("Only an under-review application is decided");
    }
    const given = loose<ReviewPermission>(permission);
    if (given.allowed) return loose(given.reviewAs);
    if (given.reason === "awaitingStewards") {
      throw new BusinessRuleError(
        ApplicationErrorCode.AwaitingStewards,
        "The stewards' review period has not elapsed",
      );
    }
    if (given.reason === "registrationPending") {
      throw new BusinessRuleError(
        ApplicationErrorCode.RegistrationPending,
        "The companion registration is not decided yet",
      );
    }
    throw new Error("A notApprover permission cannot decide");
  }

  /**
   * Who may decide an application and how (`spec/domains/index.md`
   * 「操作の可否」「申請の判断」). `decide` never throws: usecases throw
   * `ForbiddenError` on `notApprover`. Only the approver returns an
   * application; an overdue proxy approves or rejects (I-13).
   */
  const ApproverPolicy = {
    seatOf,
    decide,
    reviewAs,
    returnAs: <A extends UnderReview<App>>(
      app: A,
      permission: OpenPermissionFor<SpecOfApp<M, A>>,
    ): "approver" => {
      const as: ReviewAs = reviewAs(app, permission);
      if (as === "overdue_proxy") {
        throw new BusinessRuleError(
          ApplicationErrorCode.OverdueProxyCannotReturn,
          "An overdue proxy cannot return an application",
        );
      }
      return as;
    },
  };

  // --- Application -----------------------------------------------------

  const ownedPhotoIds = (c: ApplicationCaseIn<M>): readonly PhotoId[] =>
    definitionOf(loose<LooseCase>(c).target.kind).ownedPhotoIds(loose(c));

  const photoOwner = (id: ApplicationId): PhotoOwnerRef => ({
    kind: "application",
    id,
  });

  function submit<T extends Target>(
    params: SubmitParams<SpecOfTarget<M, T>, T>,
    now: Date,
  ): WithEventDrafts<
    UnderReview<ApplicationFor<SpecOfTarget<M, T>>>,
    ApplicationSubmittedEvent
  > &
    WithClaimedPhotos {
    const { id, admission, reserved, content, ...desired } =
      loose<
        Readonly<{
          id: ApplicationId;
          admission: Admission<TargetBase>;
          reserved: object;
          content: unknown;
        }>
      >(params);
    assertHolds(admission.premise);
    const definition = definitionOf(admission.target.kind);
    const entity: LooseApp = {
      id,
      target: admission.target,
      ...reserved,
      content,
      ...desired,
      status: { kind: "underReview", since: now, answering: null },
      submittedAt: now,
      version: Version.initial(),
    };
    return loose({
      entity,
      eventDrafts: [
        ApplicationEvents.submitted(id, definition.seatOf(entity.target), now),
      ],
      claimedPhotoIds: definition.ownedPhotoIds(entity),
    });
  }

  function sendBack<A extends UnderReview<App>>(
    app: A,
    _as: "approver",
    request: ReturnRequest,
    now: Date,
  ): WithEventDrafts<
    Returned<ApplicationFor<SpecOfApp<M, A>>>,
    ApplicationReturnedEvent
  > {
    const current = loose<LooseApp>(
      ApplicationStatus.requireUnderReview(loose<LooseApp>(app)),
    );
    return loose({
      entity: {
        ...current,
        status: { kind: "returned", request },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.returned(current.id, current.target.applicant, now),
      ],
    });
  }

  function resubmit<A extends Returned<App>>(
    app: A,
    amended: Amendment<SpecOfApp<M, A>>,
    premise: PremiseHolds,
    now: Date,
  ): WithEventDrafts<
    UnderReview<ApplicationFor<SpecOfApp<M, A>>>,
    ApplicationResubmittedEvent | PhotosReleasedEvent
  > &
    WithClaimedPhotos {
    assertHolds(premise);
    const current = ApplicationStatus.requireReturned(loose<LooseApp>(app));
    const { request } = current.status;
    const { content, reply, ...desired } =
      loose<Readonly<{ content: unknown; reply: ReturnReply | null }>>(amended);
    const definition = definitionOf(current.target.kind);
    const entity: LooseApp = {
      ...current,
      content,
      ...desired,
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
    return loose({
      entity,
      eventDrafts,
      claimedPhotoIds: after.filter((photo) => !before.includes(photo)),
    });
  }

  function decisionStatus(
    app: LooseApp,
    as: ReviewAs,
    outcome:
      | Readonly<{ kind: "approved" }>
      | Readonly<{ kind: "rejected"; reason: RejectionReason }>,
  ): AnyApplicationStatus {
    const { seat } = definitionOf(app.target.kind);
    if (seat === "steward") return { ...outcome, reviewAs: as };
    if (as !== "approver") {
      throw new Error("An operator-seat kind has no overdue proxy");
    }
    return outcome;
  }

  function approve<A extends UnderReview<App>>(
    app: A,
    as: ReviewAsFor<SpecOfApp<M, A>>,
    premise: PremiseHolds,
    now: Date,
  ): WithEventDrafts<
    ApplicationFor<SpecOfApp<M, A>>,
    ApplicationApprovedEvent
  > {
    assertHolds(premise);
    const current = loose<LooseApp>(
      ApplicationStatus.requireUnderReview(loose<LooseApp>(app)),
    );
    return loose({
      entity: {
        ...current,
        status: decisionStatus(current, as, { kind: "approved" }),
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.approved(current.id, current.target.applicant, now),
      ],
    });
  }

  function reject<A extends UnderReview<App>>(
    app: A,
    as: ReviewAsFor<SpecOfApp<M, A>>,
    reason: RejectionReason,
    now: Date,
  ): WithEventDrafts<
    ApplicationFor<SpecOfApp<M, A>>,
    ApplicationRejectedEvent
  > {
    const current = loose<LooseApp>(
      ApplicationStatus.requireUnderReview(loose<LooseApp>(app)),
    );
    return loose({
      entity: {
        ...current,
        status: decisionStatus(current, as, { kind: "rejected", reason }),
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.rejected(current.id, current.target.applicant, now),
      ],
    });
  }

  function withdraw<A extends Active<App>>(
    app: A,
    now: Date,
  ): WithEventDrafts<
    ApplicationFor<SpecOfApp<M, A>>,
    ApplicationWithdrawnEvent
  > {
    const current = loose<LooseApp>(
      ApplicationStatus.requireActive(loose<LooseApp>(app)),
    );
    return loose({
      entity: {
        ...current,
        status: { kind: "withdrawn" },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.withdrawn(
          current.id,
          seatOf(loose(current.target)),
          now,
        ),
      ],
    });
  }

  function reassess<A extends Active<App>>(
    app: A,
    result: PremiseResultFor<SpecOfApp<M, A>>,
    now: Date,
  ): WithEventDrafts<ApplicationFor<SpecOfApp<M, A>>, ApplicationLapsedEvent> {
    const current = loose<LooseApp>(
      ApplicationStatus.requireActive(loose<LooseApp>(app)),
    );
    const given = loose<PremiseResult>(result);
    if (given.holds) return loose({ entity: current, eventDrafts: [] });
    return loose({
      entity: {
        ...current,
        status: { kind: "lapsed", brokenPremises: given.broken },
        version: Version.next(current.version),
      },
      eventDrafts: [
        ApplicationEvents.lapsed(current.id, current.target.applicant, now),
      ],
    });
  }

  function matchesSubmission(app: App, request: RequestIn<M>): boolean {
    const stored = loose<LooseApp>(app);
    const given = loose<Readonly<{ target: TargetBase }>>(request);
    if (stored.target.kind !== given.target.kind) return false;
    return definitionOf(stored.target.kind).matchesSubmission(stored, given);
  }

  /**
   * The appointee of an approved stewardship claim: the applicant's
   * account as a usecase read it. `null` (the applicant withdrew) refuses
   * with `APPLICATION_APPLICANT_WITHDRAWN`; the claim stays under review
   * until the withdrawal's consumer withdraws it.
   */
  function requireApplicantAccount(
    app: Readonly<{ target: Readonly<{ applicant: IndividualApplicant }> }>,
    account: Readonly<{ accountId: AccountId; email: EmailAddress }> | null,
  ): Readonly<{ accountId: AccountId; email: EmailAddress }> {
    if (account === null) {
      throw new BusinessRuleError(
        ApplicationErrorCode.ApplicantWithdrawn,
        "The applicant has withdrawn",
      );
    }
    if (account.accountId !== app.target.applicant.accountId) {
      throw new Error("The account read is not the applicant's");
    }
    return { accountId: account.accountId, email: account.email };
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

  function snapshot(app: App): ApplicationSnapshot {
    const current = loose<LooseApp>(app);
    return {
      id: current.id,
      kind: current.target.kind,
      case: definitionOf(current.target.kind).snapshot(current),
      status: snapshotStatus(current.status),
      submittedAt: current.submittedAt,
      version: current.version,
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
        const allowed: readonly string[] = PremiseRules.required(
          definition.premises,
          target,
        );
        const broken = stored.brokenPremises ?? [];
        const [first, ...rest] = broken;
        if (first === undefined) throw new Error("No broken premise");
        if (
          new Set(broken).size !== broken.length ||
          broken.some((key) => !allowed.includes(key))
        ) {
          throw new Error("Broken premises outside the kind's premises");
        }
        return {
          kind: "lapsed",
          brokenPremises: [first as PremiseKey, ...(rest as PremiseKey[])],
        };
      }
      default:
        throw new Error(`Unknown status: ${stored.kind}`);
    }
  }

  function reconstruct(stored: ApplicationSnapshot): App {
    try {
      const definition = definitionOf(stored.kind);
      const c = loose<LooseCase>(definition.reconstruct(stored.case));
      if (c.target.kind !== stored.kind) {
        throw new Error(`A ${stored.kind} holds a ${c.target.kind} target`);
      }
      if (c.target.applicant.kind === "individual") {
        AccountId.create(c.target.applicant.accountId);
      }
      const app: LooseApp = {
        ...c,
        id: ApplicationId.create(stored.id),
        status: reconstructStatus(stored.status, definition, c.target),
        submittedAt: storedDate(stored.submittedAt),
        version: Version.create(stored.version),
      };
      return loose(app);
    } catch (error) {
      throw new RehydrationError(
        "Stored application violates invariants",
        error,
      );
    }
  }

  /**
   * The aggregate's behaviours (`spec/domains/application.md`
   * 「Application（集約）」). All pure; the version advances by one on every
   * change. Behaviours limited to a status take the application narrowed by
   * the matching `require…` guard.
   */
  const Application = {
    submit,
    matchesSubmission,
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
    isHandledBy: (app: App, acting: ActingApplicant): boolean =>
      Applicant.isHandledBy(loose<LooseApp>(app).target.applicant, acting),
    requireApplicantAccount,
    slotOf: (app: App): SlotIn<M> | null =>
      ApplicationSlot.of(loose<LooseApp>(app).target as Target),
    subjects: (c: ApplicationCaseIn<M>): readonly ApplicationSubject[] =>
      definitionOf(loose<LooseCase>(c).target.kind).subjects(loose(c)),
    approverSeat: (app: App): ApproverSeat =>
      seatOf(loose<LooseApp>(app).target as Target),
    reflectedRef: (c: ApplicationCaseIn<M>): ContentRef =>
      definitionOf(loose<LooseCase>(c).target.kind).reflectedRef(loose(c)),
    snapshot,
    reconstruct,
  };

  const ApplicationCase = { ownedPhotoIds };

  /**
   * Picks the applications whose overdue-review notice is due, once per
   * under-review spell: a steward-seat application under review whose
   * review period has elapsed and whose recorded notice (if any) is for an
   * earlier spell. Whether the seat has a steward is the review desk's
   * `asOverdueProxy` filter, not this function's.
   */
  function detect(
    app: App,
    recorded: OverdueNotice | null,
    policy: ReviewPolicy,
    now: Date,
  ): Readonly<{
    notice: OverdueNotice;
    eventDrafts: readonly EventDraft<ApplicationReviewPeriodElapsedEvent>[];
  }> | null {
    const current = loose<LooseApp>(app);
    const { status } = current;
    if (status.kind !== "underReview") return null;
    if (definitionOf(current.target.kind).seat !== "steward") return null;
    if (
      ReviewPolicy.proxyableAt({ status }, policy).getTime() > now.getTime()
    ) {
      return null;
    }
    if (
      recorded !== null &&
      recorded.pendingSince.getTime() === status.since.getTime()
    ) {
      return null;
    }
    return {
      notice: { applicationId: current.id, pendingSince: status.since },
      eventDrafts: [
        ApplicationEvents.reviewPeriodElapsed(current.id, status.since, now),
      ],
    };
  }

  const OverdueReviewWatch = { detect };

  return {
    Application,
    ApplicationCase,
    ApplicationSlot,
    Premise,
    SubmissionScope,
    ApproverPolicy,
    OverdueReviewWatch,
  };
}

export type ApplicationModel<M extends KindMap> = ReturnType<
  typeof createApplicationModel<M>
>;
