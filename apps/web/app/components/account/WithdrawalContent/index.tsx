import { getMyAccount } from "@repo/core/application/account/getMyAccount";
import { previewWithdrawal } from "@repo/core/application/account/previewWithdrawal";
import { getContainer } from "@repo/core/application/di/containerStore";
import { requireActor } from "@/presentation/actor";
import type { WithdrawalView } from "@/presentation/withdrawal";
import { WithdrawalPanel } from "../WithdrawalPanel";

async function loadWithdrawal(): Promise<WithdrawalView> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const [account, preview] = await Promise.all([
    getMyAccount({ container, actor }),
    previewWithdrawal({ container, actor, input: {} }),
  ]);
  return {
    email: account.email,
    canWithdraw: preview.canWithdraw,
    vacates: preview.vacates.map(({ target, name }) => ({
      kind: target.kind,
      id: target.id,
      name,
    })),
  };
}

/** MY-07's body, rendered on the server from the withdrawal preview. */
export async function WithdrawalContent() {
  return <WithdrawalPanel view={await loadWithdrawal()} />;
}
