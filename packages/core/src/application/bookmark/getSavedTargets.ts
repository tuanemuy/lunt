import type { Actor } from "@repo/core/domain/common/actor";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { RequestContainer } from "../di/types";
import { requireSignedIn } from "./signedIn";

export type GetSavedTargetsInput = Readonly<{
  /** 0–100 targets (`IdBatch`); split larger sets into several calls. */
  targets: readonly BookmarkRef[];
}>;

/**
 * The targets among `targets` the signed-in account has saved, in no order
 * (KEP-01 / CF-04 on VW-01, DT-01, DT-02) — whether saved is independent of
 * whether viewable. Discovery's reads never carry it.
 *
 * Errors: `BusinessRuleError` `COMMON_INVALID_INPUT` above 100 targets;
 * `UnauthorizedError` `LOGIN_REQUIRED` without an actor.
 */
export async function getSavedTargets({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: GetSavedTargetsInput;
}>): Promise<readonly BookmarkRef[]> {
  const signedIn = requireSignedIn(actor);
  return container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.findSavedTargets(signedIn.accountId, input.targets),
  );
}
