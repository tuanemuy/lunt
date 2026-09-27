import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type {
  UnitOfWorkContext,
  UnitOfWorkProvider,
  UnitOfWorkRepositories,
} from "@repo/core/application/execution/unitOfWork";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import {
  attachEventIds,
  type DomainEvent,
  EventId,
} from "@repo/core/domain/common/event";
import { mapDoError } from "./helpers";
import type { CommitRequest, LuntStateClient } from "./protocol/client";
import type { WriteCommand } from "./protocol/commands";
import { createRepositories } from "./repositories";
import type { RepositoryDeps } from "./repositories/deps";

/**
 * Durable Object implementation of `UnitOfWorkProvider`.
 *
 * The callback runs in the calling Worker; repository reads go to the
 * DO immediately (`query`), while writes and outbox events buffer
 * locally as plain commands. After `fn` resolves, one `commit` RPC ships
 * the buffer and the DO applies it inside a single `transactionSync` —
 * aggregate writes and outbox rows commit atomically, and every failure
 * the port contracts name comes back as data naming the command that
 * lost. Committing events arms the DO's own relay alarm.
 */
export class DoUnitOfWorkProvider implements UnitOfWorkProvider {
  constructor(
    private readonly client: LuntStateClient,
    private readonly idGenerator: IdGenerator,
    /** Conformance suites swap in repositories bound to test-only models. */
    private readonly repositories: (
      deps: RepositoryDeps,
    ) => UnitOfWorkRepositories = createRepositories,
  ) {}

  async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    const writes: WriteCommand[] = [];
    const collected: DomainEvent[] = [];

    const ctx: UnitOfWorkContext = {
      ...this.repositories({
        client: this.client,
        writes,
        idGenerator: this.idGenerator,
      }),
      collectEvents: (drafts) => {
        collected.push(
          ...attachEventIds(drafts, () =>
            EventId.create(this.idGenerator.next()),
          ),
        );
      },
    };

    const result = await fn(ctx);

    if (writes.length === 0 && collected.length === 0) {
      return result;
    }

    const request: CommitRequest = {
      writes,
      events: collected.map((event) => ({
        id: event.id,
        type: event.type,
        payload: event.payload,
        occurredAt: event.occurredAt,
        aggregateId: event.aggregateId,
      })),
    };

    const outcome = await mapDoError("Failed to commit unit of work", () =>
      this.client.commit(request),
    );
    if (outcome.kind === "rejected") {
      const { failure } = outcome;
      if (failure.kind === "notFound") {
        throw new NotFoundError(failure.code, failure.message);
      }
      throw new ConflictError(failure.code, failure.message);
    }
    return result;
  }
}
