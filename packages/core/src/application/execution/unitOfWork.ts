import type { AccountRepositories } from "@repo/core/domain/account/ports/unitOfWork";
import type { ApplicationRepositories } from "@repo/core/domain/application/ports/unitOfWork";
import type { AreaRepositories } from "@repo/core/domain/area/ports/unitOfWork";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import type { BookmarkRepositories } from "@repo/core/domain/bookmark/ports/unitOfWork";
import type { EventDraft } from "@repo/core/domain/common/event";
import type { DiscoveryRepositories } from "@repo/core/domain/discovery/ports/unitOfWork";
import type { ListingRepositories } from "@repo/core/domain/listing/ports/unitOfWork";
import type { MediaRepositories } from "@repo/core/domain/media/ports/unitOfWork";
import type { ModerationRepositories } from "@repo/core/domain/moderation/ports/unitOfWork";
import type { NotificationRepositories } from "@repo/core/domain/notification/ports/unitOfWork";
import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import type { RegionRepositories } from "@repo/core/domain/region/ports/unitOfWork";

/**
 * Aggregate repositories reachable inside a unit of work. Each domain
 * adds its repositories here (`spec/domains/index.md` 「UnitOfWork ポート」):
 * they are obtained only from the context, never from the container.
 */
export type UnitOfWorkRepositories = AccountRepositories &
  AuthorityRepositories &
  ApplicationRepositories &
  NotificationRepositories &
  AreaRepositories &
  MediaRepositories &
  PlaceRepositories &
  ListingRepositories &
  DiscoveryRepositories &
  ModerationRepositories &
  RegionRepositories &
  OccasionRepositories &
  BookmarkRepositories;

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
