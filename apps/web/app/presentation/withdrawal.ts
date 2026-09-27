import type { StewardedKind } from "@repo/core/domain/common/refs";
import { createServerFn } from "@tanstack/react-start";
import { serializeError } from "./errorResponse";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/** What MY-07's confirmation state shows. */
export type WithdrawalView = Readonly<{
  email: string;
  /** `false` for the only operator (退会できない). */
  canWithdraw: boolean;
  /** Targets withdrawing would leave without a steward. */
  vacates: ReadonlyArray<
    Readonly<{ kind: StewardedKind; id: string; name: string | null }>
  >;
}>;

/**
 * How a withdrawal ended: `withdrawn` (退会済み), or `sessionLost` — the
 * browser was no longer logged in (退会の前にログインが切れた), so nothing
 * was done. Either way the browser is logged out afterwards.
 */
export type WithdrawOutcome = Readonly<{
  kind: "withdrawn" | "sessionLost";
}>;

/**
 * MY-07: withdraws the logged-in account and ends this browser's session.
 * `AUTHORITY_LAST_OPERATOR` (business) when it is the only operator.
 */
export const withdrawFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<WithdrawOutcome> => {
    const [{ getContainer }, { resolveActor, endSession }, { withdraw }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/account/withdraw"),
      ]);
    const container = await getContainer();
    const actor = await resolveActor(container);
    if (actor === null) {
      endSession(container);
      return { kind: "sessionLost" };
    }
    try {
      await withdraw({ container, actor, input: {} });
    } catch (error) {
      // Withdrawn from another device between the check and the commit.
      if (serializeError(error).kind === "unauthorized") {
        endSession(container);
        return { kind: "sessionLost" };
      }
      throw error;
    }
    endSession(container);
    return { kind: "withdrawn" };
  });
