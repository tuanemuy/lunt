import type { AccessGuard } from "@repo/core/domain/authority/ports/accessGuard";
import type { Role } from "@repo/core/domain/authority/role";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { CommitCondition } from "../protocol/conditions";

/** Appends Authority's commit conditions to the unit of work. */
export class DoAccessGuard implements AccessGuard {
  constructor(private readonly conditions: CommitCondition[]) {}

  holdsRole(accountId: AccountId, role: Role): void {
    this.conditions.push({ kind: "authority.holdsRole", accountId, role });
  }

  stewards(accountId: AccountId, target: StewardedRef): void {
    this.conditions.push({
      kind: "authority.stewards",
      accountId,
      target: { kind: target.kind, id: target.id },
    });
  }

  vacant(target: StewardedRef): void {
    this.conditions.push({
      kind: "authority.vacant",
      target: { kind: target.kind, id: target.id },
    });
  }

  staffed(target: StewardedRef): void {
    this.conditions.push({
      kind: "authority.staffed",
      target: { kind: target.kind, id: target.id },
    });
  }
}
