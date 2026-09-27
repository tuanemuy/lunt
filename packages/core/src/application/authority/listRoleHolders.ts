import type { Role } from "@repo/core/domain/authority/role";
import {
  type RoleHolder,
  RoleRoster,
} from "@repo/core/domain/authority/roleRoster";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import { type ActorServiceArgs, authorizeRole } from "./access";
import { findAccountsByIds } from "./accounts";

export type RoleHolderView = Readonly<{
  accountId: AccountId;
  email: EmailAddress;
  isSelf: boolean;
  since: Date;
}>;

/** Each role's holders, oldest grant first; editors may be empty. */
export type ListRoleHoldersOutput = Readonly<
  Record<Role, readonly RoleHolderView[]>
>;

/** Editors and operators with their email addresses (`operate_service`). */
export async function listRoleHolders({
  container,
  actor,
}: Pick<
  ActorServiceArgs<unknown>,
  "container" | "actor"
>): Promise<ListRoleHoldersOutput> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const [editor, operator] = await Promise.all([
      ctx.roleRosterRepository.find("editor"),
      ctx.roleRosterRepository.find("operator"),
    ]);
    const editors = RoleRoster.holders(editor.entity);
    const operators = RoleRoster.holders(operator.entity);
    const accounts = await findAccountsByIds(
      ctx.accountRepository,
      [...editors, ...operators].map((holder) => holder.accountId),
    );
    const toViews = (holders: readonly RoleHolder[]): RoleHolderView[] =>
      holders.flatMap((holder) => {
        const account = accounts.get(holder.accountId);
        return account === undefined
          ? []
          : [
              {
                accountId: holder.accountId,
                email: account.email,
                isSelf: holder.accountId === actor.accountId,
                since: holder.since,
              },
            ];
      });
    return { editor: toViews(editors), operator: toViews(operators) };
  });
}
