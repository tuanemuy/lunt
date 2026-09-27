import type { AccountRepository } from "@repo/core/domain/account/ports/accountRepository";
import type { EventDraft } from "@repo/core/domain/common/event";

/**
 * Aggregate repositories reachable inside a unit of work. Each domain
 * adds its repositories here (`spec/domains/index.md` 「UnitOfWork ポート」):
 * they are obtained only from the context, never from the container.
 */
export type UnitOfWorkRepositories = Readonly<{
  accountRepository: AccountRepository;
}>;

export type UnitOfWorkContext = UnitOfWorkRepositories &
  Readonly<{
    /**
     * Enqueue domain event drafts for outbox flush at commit time.
     *
     * Drafts are identity-less by design — `EventId` is minted by the UoW
     * implementation against the application's `IdGenerator` port and
     * attached as the draft is buffered.
     */
    collectEvents(drafts: readonly EventDraft[]): void;
  }>;

/**
 * Runs `fn` as one atomic scope: it commits when `fn` resolves and rolls
 * back — no writes, no events — when it throws. Reads inside the scope
 * hit storage immediately; writes are applied together at commit, so a
 * scope must not rely on reading its own uncommitted writes. Optimistic
 * lock conflicts and port-guarded uniqueness violations surface as
 * `ConflictError`, a `save` / `delete` of a missing aggregate as
 * `NotFoundError`, at the latest when the scope commits. `fn` runs
 * exactly once: a failed commit is never retried here.
 */
export interface UnitOfWorkProvider {
  run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
