import type {
  ApplicationIn,
  KindMap,
  SlotIn,
} from "@repo/core/domain/application/kind";
import type { ApplicationModel } from "@repo/core/domain/application/model";
import type {
  ApplicantCriteria,
  ApplicationRepository,
  SubjectFilter,
} from "@repo/core/domain/application/ports/applicationRepository";
import type { Active } from "@repo/core/domain/application/status";
import type { ApplicationSubject } from "@repo/core/domain/application/subject";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId, ApplicationId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { applicationRecords } from "../applicationRecords";
import { mapDoError } from "../helpers";
import type { ApplicationPage } from "../protocol/application";
import type { RepositoryDeps } from "./deps";

/**
 * `ApplicationRepository` over the Lunt state object, for the kinds of
 * `model`. Reads query the object immediately; writes append commands to
 * the unit of work's buffer, which the object applies — with the id and
 * active-slot uniqueness and the optimistic lock — at commit. The lookup
 * keys (applicant, slot, seat, subjects) are computed here by the domain
 * and stored with the application on insert.
 */
export class DoApplicationRepository<M extends KindMap>
  implements ApplicationRepository<M>
{
  private readonly records: ReturnType<typeof applicationRecords<M>>;

  constructor(
    private readonly deps: RepositoryDeps,
    model: ApplicationModel<M>,
  ) {
    this.records = applicationRecords(model, deps.idGenerator);
  }

  /**
   * The same repository — same client, same unit-of-work buffer — for the
   * kinds of another model. The unit of work builds its repositories for
   * the production kinds; the conformance suites rebind this one to the
   * test-only kinds through it.
   */
  withModel<N extends KindMap>(
    model: ApplicationModel<N>,
  ): DoApplicationRepository<N> {
    return new DoApplicationRepository(this.deps, model);
  }

  private activePage(
    page: ApplicationPage,
  ): PaginationResult<Versioned<Active<ApplicationIn<M>>>> {
    return {
      items: page.items.map((record) =>
        this.records.versioned(record, this.records.toActive(record)),
      ),
      count: page.count,
    };
  }

  private page(page: ApplicationPage): PaginationResult<ApplicationIn<M>> {
    return {
      items: page.items.map((record) => this.records.toApplication(record)),
      count: page.count,
    };
  }

  findById(id: ApplicationId): Promise<Versioned<ApplicationIn<M>> | null> {
    return mapDoError("Failed to find application", async () => {
      const record = await this.deps.client.query("application.findById", {
        id,
      });
      return record === null
        ? null
        : this.records.versioned(record, this.records.toApplication(record));
    });
  }

  async findByIds(
    ids: readonly ApplicationId[],
  ): Promise<readonly ApplicationIn<M>[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find applications", async () => {
      const records = await this.deps.client.query("application.findByIds", {
        ids,
      });
      return records.map((record) => this.records.toApplication(record));
    });
  }

  findActiveBySlot(slot: SlotIn<M>): Promise<Active<ApplicationIn<M>> | null> {
    return mapDoError("Failed to find application by slot", async () => {
      const record = await this.deps.client.query(
        "application.findActiveBySlot",
        { slotKey: this.records.slotKey(slot) },
      );
      return record === null ? null : this.records.toActive(record);
    });
  }

  findActiveBySubject(
    subject: ApplicationSubject,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Active<ApplicationIn<M>>>>> {
    return mapDoError("Failed to list applications by subject", async () =>
      this.activePage(
        await this.deps.client.query("application.findActiveBySubject", {
          subject: { kind: subject.kind, id: subject.id },
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  findActiveByIndividual(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Active<ApplicationIn<M>>>>> {
    return mapDoError("Failed to list applications of an account", async () =>
      this.activePage(
        await this.deps.client.query("application.findActiveByIndividual", {
          accountId,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  findPageByApplicants(
    criteria: ApplicantCriteria,
    pagination: Pagination,
  ): Promise<PaginationResult<ApplicationIn<M>>> {
    return mapDoError("Failed to list applications by applicant", async () =>
      this.page(
        await this.deps.client.query("application.findPageByApplicants", {
          individual: criteria.individual,
          places: criteria.places,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  findPageBySubject(
    subject: ApplicationSubject,
    filter: SubjectFilter<M>,
    pagination: Pagination,
  ): Promise<PaginationResult<ApplicationIn<M>>> {
    return mapDoError("Failed to list applications by subject", async () =>
      this.page(
        await this.deps.client.query("application.findPageBySubject", {
          subject: { kind: subject.kind, id: subject.id },
          kinds: filter.kinds ?? null,
          statuses: filter.statuses ?? null,
          applicant: filter.applicant ?? null,
          page: pagination.page,
          limit: pagination.limit,
        }),
      ),
    );
  }

  async insert(app: ApplicationIn<M>): Promise<void> {
    this.deps.writes.push({
      kind: "application.insert",
      record: this.records.toRecord(app),
      index: this.records.toIndex(app),
    });
  }

  async save(
    app: ApplicationIn<M>,
    expectedVersion: ExpectedVersion<ApplicationIn<M>>,
  ): Promise<void> {
    this.deps.writes.push({
      kind: "application.save",
      record: this.records.toRecord(app),
      expectedVersion,
    });
  }
}
