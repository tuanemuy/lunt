import type { Application } from "@repo/core/domain/application/application";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

/** A registration's companion stewardship claim (併せた申請) and its status. */
export type CompanionView = Readonly<{
  id: ApplicationId;
  status: ApplicationStatusKind;
}>;

/**
 * The companion claim of the registration `registrationId`
 * (`spec/domains/application.md` 「種類ごとの内容」): the first claim
 * referring to it in `findPageBySubject`'s order — the active one if any,
 * else the newest. `null` when none refers to it.
 */
export async function readCompanion(
  ctx: Pick<UnitOfWorkContext, "applicationRepository">,
  registrationId: ApplicationId,
): Promise<Application | null> {
  const page = await ctx.applicationRepository.findPageBySubject(
    { kind: "registration", id: registrationId },
    {},
    { page: 1, limit: 1 },
  );
  return page.items[0] ?? null;
}

export const companionView = (app: Application | null): CompanionView | null =>
  app === null ? null : { id: app.id, status: app.status.kind };
