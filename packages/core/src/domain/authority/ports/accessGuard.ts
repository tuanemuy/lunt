import type { AccountId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { Role } from "../role";

/**
 * Keeps an access decision true until the unit of work commits. Each
 * method records a fact the decision rested on; if it no longer holds
 * when the unit of work commits (a revocation, resignation or
 * appointment committed after the read), nothing of the unit of work is
 * kept and `run` throws `ForbiddenError` (`spec/usecases/authority.md`:
 * 「確定までの間に役割を解除された場合を含む」). Facts are checked
 * before the unit of work's own writes, so an operator may still revoke
 * their own role. A unit of work without writes commits nothing and
 * checks nothing.
 */
export interface AccessGuard {
  /** `accountId` still holds `role`. */
  holdsRole(accountId: AccountId, role: Role): void;
  /** `accountId` is still a steward of `target`. */
  stewards(accountId: AccountId, target: StewardedRef): void;
  /** `target` still has no steward (absence proxy). */
  vacant(target: StewardedRef): void;
}
