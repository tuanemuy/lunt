import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { Role } from "../role";
import type { RoleRoster, RosterOf } from "../roleRoster";

/**
 * The role rosters, one per role under a fixed key
 * (`spec/domains/authority.md` 「RoleRosterRepository」). No insert, no
 * delete.
 *
 * - `find`: never `null`. While nothing is stored it returns
 *   `RoleRoster.initial(role)` with an `expectedVersion` meaning "not
 *   saved yet".
 * - `save`: optimistic lock; `ConflictError` on a mismatch. The "not saved
 *   yet" version succeeds only while nothing is stored, so two first saves
 *   cannot both win.
 * - `findRolesOf`: the roles the account holds; empty when none.
 */
export interface RoleRosterRepository {
  find<R extends Role>(role: R): Promise<Versioned<RosterOf<R>>>;
  save(
    roster: RoleRoster,
    expectedVersion: ExpectedVersion<RoleRoster>,
  ): Promise<void>;
  findRolesOf(accountId: AccountId): Promise<ReadonlySet<Role>>;
}
