import type {
  AccountId,
  ApplicationId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  TransactionalRepository,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { ApplicantKind } from "../applicant";
import type { ApplicationIn, KindMap, KindName, SlotIn } from "../kind";
import type { ApplicationKindMap } from "../kinds";
import type { Active, ApplicationStatusKind } from "../status";
import type { ApplicationSubject } from "../subject";

/** `findPageBySubject`'s filter: an omitted item does not filter. */
export type SubjectFilter<M extends KindMap = ApplicationKindMap> = Readonly<{
  kinds?: readonly KindName<M>[];
  statuses?: readonly ApplicationStatusKind[];
  applicant?: ApplicantKind;
}>;

/** `findPageByApplicants`: an individual, and places acted for as steward. */
export type ApplicantCriteria = Readonly<{
  individual: AccountId | null;
  /** No size limit: a filter, not a lookup. */
  places: readonly PlaceId[];
}>;

/**
 * Applications (`spec/domains/application.md` 「ApplicationRepository」),
 * inside a unit of work as `applicationRepository`. Never deleted. Typed
 * over the registered kinds (`M`, the production kinds by default).
 *
 * - `insert`: `ConflictError` on a taken id, and on an active application
 *   already in the same slot (`ApplicationSlot.key`) — the port guarantees
 *   one active application per slot; of two concurrent submissions to a
 *   slot the later commit loses.
 * - `findById` / `save`: the common contract (optimistic lock; `save` of a
 *   missing application is `NotFoundError`). A closed application's slot
 *   frees when its `save` commits.
 * - `findByIds`: 0–100 ids (`COMMON_INVALID_INPUT` above), any status, in
 *   no particular order.
 * - `findActiveBySlot`: the slot's active application, or `null`.
 * - `findActiveBySubject` / `findActiveByIndividual`: active applications
 *   with their versions, id ascending; callers read every page.
 * - `findPageByApplicants`: the individual's applications and those made
 *   as a steward of one of `places`, any status, newest `submittedAt`
 *   first, then id; both empty → empty.
 * - `findPageBySubject`: applications whose subjects include `subject`,
 *   filtered; active first, then newest `submittedAt`, then id.
 *
 * Committed writes show in every read at once.
 */
export interface ApplicationRepository<M extends KindMap = ApplicationKindMap>
  extends Omit<
    TransactionalRepository<ApplicationIn<M>, ApplicationId>,
    "delete"
  > {
  findByIds(
    ids: readonly ApplicationId[],
  ): Promise<readonly ApplicationIn<M>[]>;
  findActiveBySlot(slot: SlotIn<M>): Promise<Active<ApplicationIn<M>> | null>;
  findActiveBySubject(
    subject: ApplicationSubject,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Active<ApplicationIn<M>>>>>;
  findActiveByIndividual(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Active<ApplicationIn<M>>>>>;
  findPageByApplicants(
    criteria: ApplicantCriteria,
    pagination: Pagination,
  ): Promise<PaginationResult<ApplicationIn<M>>>;
  findPageBySubject(
    subject: ApplicationSubject,
    filter: SubjectFilter<M>,
    pagination: Pagination,
  ): Promise<PaginationResult<ApplicationIn<M>>>;
}
