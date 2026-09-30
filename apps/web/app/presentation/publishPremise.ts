import {
  CommonErrorCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";
import type { PublishableSubject } from "@repo/core/domain/common/exposureSubject";
import { presentBusinessError } from "./businessErrorCatalog";
import { AppServerError } from "./errorResponse";
import { classifyError } from "./errorState";

/** What publishing needs of a target's current state. */
export type PublishPremise = Readonly<{
  published: boolean;
  suspended: boolean;
}>;

/**
 * The code a publish would be refused with on `premise`, in
 * `Publication.publish`'s order, or `null` while publishing is still possible.
 */
export function lostPublishPremise(
  subject: PublishableSubject,
  premise: PublishPremise,
): string | null {
  if (premise.suspended) return SubjectErrorCode.suspended(subject);
  if (premise.published) return CommonErrorCode.PublicationInvalidTransition;
  return null;
}

/**
 * What to report when the save a publish makes first (unsaved changes) fails.
 * A conflict may be someone else's publication, which also moves the version:
 * the publish's premise is judged before the content conflict, and CS-08 is
 * shown alone once it is gone (`spec/pages/index.md` CS-08). Any other
 * failure, a premise that still holds, or a premise that cannot be read
 * leaves the save's own error.
 */
export async function publishSaveFailure(
  error: unknown,
  subject: PublishableSubject,
  readPremise: () => Promise<PublishPremise>,
): Promise<unknown> {
  if (classifyError(error).kind !== "conflict") return error;
  let code: string | null;
  try {
    code = lostPublishPremise(subject, await readPremise());
  } catch {
    return error;
  }
  if (code === null) return error;
  return new AppServerError({
    kind: "business",
    code,
    message: presentBusinessError(code).message,
  });
}
