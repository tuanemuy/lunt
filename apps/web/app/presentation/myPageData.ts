// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getMyAccount } from "@repo/core/application/account/getMyAccount";
import { getMyAuthority } from "@repo/core/application/authority/getMyAuthority";
import { getContainer } from "@repo/core/application/di/containerStore";
import { resolveActor } from "./actor";
import type { MyPageData } from "./myPage";

/** Stewarded targets MY-01 lists at once; stage 1 has no targets yet. */
const STEWARDED_PAGE = { page: 1, limit: 100 } as const;

/** MY-01's data: the guest state, or the account with its authority. */
export async function loadMyPage(): Promise<MyPageData> {
  const container = await getContainer();
  const devTools = container.runtime.devTools;
  const actor = await resolveActor(container);
  if (actor === null) return { kind: "guest", devTools };
  const [account, authority] = await Promise.all([
    getMyAccount({ container, actor }),
    getMyAuthority({
      container,
      actor,
      input: { pagination: STEWARDED_PAGE },
    }),
  ]);
  return {
    kind: "member",
    email: account.email,
    roles: authority.roles,
    stewarded: authority.stewarded.items.map(({ target, name }) => ({
      kind: target.kind,
      id: target.id,
      name,
    })),
    devTools,
  };
}
