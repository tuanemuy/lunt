import type { AccessDecision } from "@repo/core/domain/authority/accessPolicy";
import type { ApplicationId, PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { Version } from "@repo/core/domain/common/version";
import type { Applicant } from "./applicant";
import type { ApproverSeat, ApproverSeatKind } from "./approverSeat";
import type { PremiseKey, PremiseResultOf, PremiseRule } from "./premise";
import type {
  ActiveStatus,
  ApplicationStatusKind,
  LapsedStatus,
  OperatorSeatDecision,
  ReviewAs,
  StewardSeatDecision,
  WithdrawnStatus,
} from "./status";
import type { ApplicationSubject, SubmissionTarget } from "./subject";

/**
 * The per-kind mechanism of the Application aggregate.
 *
 * Application's rules split into a kind-agnostic core — the lifecycle
 * (`underReview → returned → …`), the status guards, the premise table's
 * order and codes, the approver's decision, the review period, the
 * overdue watch — and what each of the kinds (登録, 情報修正, 管理権限,
 * 所属, 離脱, 参加, 掲載, 掲載の修正) contributes: its target, content,
 * premises, approver seat, slot and subjects. The core is written once
 * against `KindSpec` / `KindDefinition`; a kind is one `KindSpec` type and
 * one `KindDefinition` value, registered in `domain/application/kinds.ts`
 * by the stage that brings the domains its content and premises read.
 * Adding a kind never edits the core, the ports or the storage.
 */

/**
 * The target of every kind (対象の指定): the kind, the applicant, and the
 * ids the kind names. It is fixed at submission and alone decides the
 * premises, the targets that must be viewable, the slot and the seat.
 */
export type TargetBase = Readonly<{ kind: string; applicant: Applicant }>;

/** A slot (申請の枠): the same applicant, kind and target ids. */
export type SlotBase = Readonly<{ kind: string; applicant: Applicant }>;

/**
 * Type-level description of one kind (`spec/domains/application.md`
 * 「ApplicationTarget」「CaseFields」「PremiseKeyOf」「PremiseFactsOf」…):
 *
 * - `target`: `TargetOf<K>`, with `kind` the kind's literal name.
 * - `content`: `ContentOf<K>` (`null` for a kind without content).
 * - `reserved`: fields fixed at submission besides the target
 *   (`ReservedOf<K>`: a reserved place or listing id, a listing revision's
 *   place); `{}` when none.
 * - `desired`: fields a resubmission replaces together with the content
 *   (`DesiredOf<K>`: `{ desired: … }` of a revision); `{}` when none.
 * - `premiseKey` / `facts`: `PremiseKeyOf<K>` (`never` for none) and
 *   `PremiseFactsOf<K>`.
 * - `seat`: where the approver sits; `steward` kinds carry `reviewAs`.
 * - `awaitsRegistration`: the decision waits on a companion registration
 *   (the stewardship claim filed with a registration).
 * - `slot`: the slot shape, or `null` for a kind that creates its target
 *   and may be filed repeatedly.
 * - `request`: the `SubmissionRequest` an idempotent resend is compared by.
 */
export type KindSpec = Readonly<{
  target: TargetBase;
  content: unknown;
  reserved: object;
  desired: object;
  premiseKey: PremiseKey;
  facts: object;
  seat: ApproverSeatKind;
  awaitsRegistration: boolean;
  slot: SlotBase | null;
  request: Readonly<{ target: TargetBase }>;
}>;

/** Kind name → spec. Declare it as a `type` alias (an interface lacks the index signature). */
export type KindMap = Readonly<Record<string, KindSpec>>;

export type KindName<M extends KindMap> = keyof M & string;

export type ApplicationBase = Readonly<{
  id: ApplicationId;
  /** The first submission; a resubmission keeps it. */
  submittedAt: Date;
  version: Version;
}>;

// Every helper below distributes over a union of specs, so a union of
// kinds keeps each kind's target, content and status together.

export type ContentFor<S extends KindSpec> = S extends KindSpec
  ? S["content"]
  : never;
export type ReservedFor<S extends KindSpec> = S extends KindSpec
  ? S["reserved"]
  : never;
export type DesiredFor<S extends KindSpec> = S extends KindSpec
  ? S["desired"]
  : never;
export type PremiseKeyFor<S extends KindSpec> = S extends KindSpec
  ? S["premiseKey"]
  : never;
export type FactsFor<S extends KindSpec> = S extends KindSpec
  ? S["facts"]
  : never;
export type SlotFor<S extends KindSpec> = S extends KindSpec
  ? Exclude<S["slot"], null>
  : never;

/** `CaseOf<K>`: the target and the kind's fields. */
export type CaseFor<S extends KindSpec> = S extends KindSpec
  ? Readonly<{ target: S["target"]; content: S["content"] }> &
      S["reserved"] &
      S["desired"]
  : never;

export type DecisionFor<S extends KindSpec> = S extends KindSpec
  ? S["seat"] extends "steward"
    ? StewardSeatDecision
    : OperatorSeatDecision
  : never;

/** Only a kind with premises can lapse, on its own premises. */
export type LapsedFor<S extends KindSpec> = S extends KindSpec
  ? [S["premiseKey"]] extends [never]
    ? never
    : LapsedStatus<S["premiseKey"]>
  : never;

/** `StatusOf<K>`. */
export type StatusFor<S extends KindSpec> = S extends KindSpec
  ? ActiveStatus | DecisionFor<S> | WithdrawnStatus | LapsedFor<S>
  : never;

/** `ApplicationOf<K>`. */
export type ApplicationFor<S extends KindSpec> = S extends KindSpec
  ? ApplicationBase & CaseFor<S> & Readonly<{ status: StatusFor<S> }>
  : never;

/** `ReviewAsOf<K>`: only a steward-seat kind can be decided by an overdue proxy. */
export type ReviewAsFor<S extends KindSpec> = S extends KindSpec
  ? S["seat"] extends "steward"
    ? ReviewAs
    : "approver"
  : never;

/** `ReviewPermissionOf<K>`. */
export type ReviewPermissionFor<S extends KindSpec> = S extends KindSpec
  ? S["seat"] extends "steward"
    ?
        | Readonly<{ allowed: true; reviewAs: ReviewAs }>
        | Readonly<{
            allowed: false;
            reason: "notApprover" | "awaitingStewards";
          }>
    : S["awaitsRegistration"] extends true
      ?
          | Readonly<{ allowed: true; reviewAs: "approver" }>
          | Readonly<{
              allowed: false;
              reason: "notApprover" | "registrationPending";
            }>
      :
          | Readonly<{ allowed: true; reviewAs: "approver" }>
          | Readonly<{ allowed: false; reason: "notApprover" }>
  : never;

/** Any kind's permission. */
export type ReviewPermission =
  | Readonly<{ allowed: true; reviewAs: ReviewAs }>
  | Readonly<{
      allowed: false;
      reason: "notApprover" | "awaitingStewards" | "registrationPending";
    }>;

/** A permission that lets the reviewer open the application (not `notApprover`). */
export type OpenPermissionFor<S extends KindSpec> = Exclude<
  ReviewPermissionFor<S>,
  Readonly<{ reason: "notApprover" }>
>;

/**
 * `ApproverFactsOf<K>`: the `AccessPolicy` decisions (and, for a claim
 * filed with a registration, the registration's status) a usecase reads
 * for the seat. `seat` is `Application.approverSeat(app).kind`.
 */
export type ApproverFactsFor<S extends KindSpec> = S extends KindSpec
  ? S["seat"] extends "steward"
    ? Readonly<{
        seat: "steward";
        /** `manage_target` on the seat's region or occasion. */
        targetManagement: AccessDecision;
        /** `operate_service`. */
        serviceOperation: AccessDecision;
      }>
    : S["awaitsRegistration"] extends true
      ? Readonly<{
          seat: "operator";
          serviceOperation: AccessDecision;
          /** The companion registration's status; `null` without one. */
          registration: ApplicationStatusKind | null;
        }>
      : Readonly<{ seat: "operator"; serviceOperation: AccessDecision }>
  : never;

/** `PremiseResultOf<K>`: a kind without premises can only hold. */
export type PremiseResultFor<S extends KindSpec> = S extends KindSpec
  ? PremiseResultOf<S["premiseKey"]>
  : never;

/** The seat a kind's `seatOf` returns. */
export type SeatFor<S extends KindSpec> = S extends KindSpec
  ? Extract<ApproverSeat, Readonly<{ kind: S["seat"] }>>
  : never;

/** What a kind definition snapshots its case to and rebuilds it from. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

/**
 * Runtime behaviour of one kind. Every function is pure and reads only
 * its arguments. `premises` lists the kind's premise rules (at most one
 * per key); the core evaluates them in the premise table's order.
 */
export type KindDefinition<S extends KindSpec> = Readonly<{
  kind: S["target"]["kind"];
  seat: S["seat"];
  awaitsRegistration: S["awaitsRegistration"];
  premises: readonly PremiseRule<S["target"], S["facts"], S["premiseKey"]>[];
  /** `ApproverPolicy.seatOf` (P-70). */
  seatOf(target: S["target"]): SeatFor<S>;
  /** `ApplicationSlot.of`; `null` for a kind without a slot. */
  slotOf(target: S["target"]): S["slot"];
  /** `SubmissionScope.targets`: the targets that must be viewable. */
  submissionTargets(target: S["target"]): readonly SubmissionTarget[];
  /** `Application.subjects`. */
  subjects(c: CaseFor<S>): readonly ApplicationSubject[];
  /** `Application.reflectedRef`: where an approval lands. */
  reflectedRef(c: CaseFor<S>): ContentRef;
  /** `ApplicationCase.ownedPhotoIds`: the photos the application owns. */
  ownedPhotoIds(c: CaseFor<S>): readonly PhotoId[];
  /**
   * `Application.matchesSubmission` for a stored case and a request of
   * this kind: the same target (as the kind compares it) and content.
   */
  matchesSubmission(c: CaseFor<S>, request: S["request"]): boolean;
  /** The case as JSON data, for storage. */
  snapshot(c: CaseFor<S>): JsonValue;
  /**
   * Rebuilds the case from `snapshot` through the value objects; throws on
   * anything invalid (the core turns it into a `RehydrationError`).
   */
  reconstruct(snapshot: JsonValue): CaseFor<S>;
}>;

/** A definition per kind of `M`, keyed by the kind's name. */
export type KindRegistry<M extends KindMap> = {
  readonly [K in KindName<M>]: KindDefinition<M[K]> & Readonly<{ kind: K }>;
};

/** The spec of kind `K` (a union of kinds gives the union of their specs). */
export type SpecOfKind<M extends KindMap, K> =
  K extends KindName<M> ? M[K] : never;

/** The spec of an application (or case, or target) of `M`. */
export type SpecOfTarget<
  M extends KindMap,
  T extends Readonly<{ kind: string }>,
> = SpecOfKind<M, T["kind"]>;

export type SpecOfApp<
  M extends KindMap,
  A extends Readonly<{ target: Readonly<{ kind: string }> }>,
> = SpecOfKind<M, A["target"]["kind"]>;

export type TargetIn<M extends KindMap> = {
  [K in KindName<M>]: M[K]["target"];
}[KindName<M>];

/** `Application`: the correlated union of every kind's application. */
export type ApplicationIn<M extends KindMap> = {
  [K in KindName<M>]: ApplicationFor<M[K]>;
}[KindName<M>];

export type ApplicationOf<
  M extends KindMap,
  K extends KindName<M>,
> = ApplicationFor<M[K]>;

/** `ApplicationCase`. */
export type ApplicationCaseIn<M extends KindMap> = {
  [K in KindName<M>]: CaseFor<M[K]>;
}[KindName<M>];

/** `ApplicationSlot`. */
export type SlotIn<M extends KindMap> = {
  [K in KindName<M>]: SlotFor<M[K]>;
}[KindName<M>];

/** `SubmissionRequest`. */
export type RequestIn<M extends KindMap> = {
  [K in KindName<M>]: M[K]["request"];
}[KindName<M>];

/** Identity helper that pins a definition to its spec. */
export function defineKind<S extends KindSpec>(
  definition: KindDefinition<S>,
): KindDefinition<S> {
  return definition;
}
