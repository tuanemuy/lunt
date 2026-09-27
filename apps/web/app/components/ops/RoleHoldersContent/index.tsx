import type { RoleHolderView } from "@repo/core/application/authority/listRoleHolders";
import { listRoleHolders } from "@repo/core/application/authority/listRoleHolders";
import { getContainer } from "@repo/core/application/di/containerStore";
import { requireActor } from "@/presentation/actor";
import type { RoleHoldersView } from "@/presentation/roles";
import { RoleBoard } from "../RoleBoard";

async function loadRoleHolders(): Promise<RoleHoldersView> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const holders = await listRoleHolders({ container, actor });
  const toItems = (views: readonly RoleHolderView[]) =>
    views.map(({ accountId, email, isSelf }) => ({ accountId, email, isSelf }));
  return {
    editor: toItems(holders.editor),
    operator: toItems(holders.operator),
  };
}

/** OM-07's lists, rendered on the server; `RoleBoard` owns the changes. */
export async function RoleHoldersContent({
  fromWithdrawal,
}: {
  fromWithdrawal: boolean;
}) {
  return (
    <RoleBoard
      holders={await loadRoleHolders()}
      fromWithdrawal={fromWithdrawal}
    />
  );
}
