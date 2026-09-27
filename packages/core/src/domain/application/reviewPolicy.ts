import { BusinessRuleError } from "@repo/core/domain/error";
import { ApplicationErrorCode } from "./errorCode";
import type { UnderReviewStatus } from "./status";

declare const reviewPolicyBrand: unique symbol;

/**
 * The review settings (判断の設定値, X-04): how long after an application
 * became under review an operator may decide it in place of the region's
 * or occasion's stewards (期間超過の代行). Built from settings by `create`.
 */
export type ReviewPolicy = Readonly<{
  /** Positive integer, in milliseconds. */
  proxyAfterMs: number;
  readonly [reviewPolicyBrand]: true;
}>;

function create(input: Readonly<{ proxyAfterMs: number }>): ReviewPolicy {
  if (!Number.isSafeInteger(input.proxyAfterMs) || input.proxyAfterMs <= 0) {
    throw new BusinessRuleError(
      ApplicationErrorCode.InvalidReviewPolicy,
      `Invalid review period: ${input.proxyAfterMs}`,
    );
  }
  return { proxyAfterMs: input.proxyAfterMs } as ReviewPolicy;
}

/**
 * The period rule lives only in these two functions: ports and adapters
 * compare instants and never know the period.
 */
export const ReviewPolicy = {
  create,

  /** When an overdue proxy becomes possible: `status.since` + the period. */
  proxyableAt: (
    app: Readonly<{ status: UnderReviewStatus }>,
    policy: ReviewPolicy,
  ): Date => new Date(app.status.since.getTime() + policy.proxyAfterMs),

  /**
   * The latest `status.since` an under-review application can have and be
   * proxyable at `now`. `since <= overdueCutoff(policy, now)` is the same
   * as `proxyableAt(app, policy) <= now`; the review desk takes it as
   * `pendingSinceBefore`.
   */
  overdueCutoff: (policy: ReviewPolicy, now: Date): Date =>
    new Date(now.getTime() - policy.proxyAfterMs),
};
