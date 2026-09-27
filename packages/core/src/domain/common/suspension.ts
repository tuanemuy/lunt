import { SubjectErrorCode } from "@repo/core/domain/common/errorCode";
import type { ExposureSubject } from "@repo/core/domain/common/exposureSubject";
import { BusinessRuleError } from "@repo/core/domain/error";

/**
 * Operator suspension, layered over (and independent of) `Publication`.
 * Suspending or lifting it never rewrites the publication state. Places carry
 * only this; articles do not carry it and pass `Suspension.none`.
 */
export type Suspension = Readonly<{ suspended: boolean }>;

export const Suspension = {
  none: { suspended: false } as Suspension,

  /** Throws `{subject}_ALREADY_SUSPENDED` when already suspended. */
  suspend: <S extends ExposureSubject>(
    s: Suspension,
    subject: S,
  ): Suspension => {
    if (s.suspended) {
      throw new BusinessRuleError(
        SubjectErrorCode.alreadySuspended(subject),
        "Already suspended",
      );
    }
    return { suspended: true };
  },

  /** Throws `{subject}_NOT_SUSPENDED` when not suspended. */
  unsuspend: <S extends ExposureSubject>(
    s: Suspension,
    subject: S,
  ): Suspension => {
    if (!s.suspended) {
      throw new BusinessRuleError(
        SubjectErrorCode.notSuspended(subject),
        "Not suspended",
      );
    }
    return { suspended: false };
  },
};
