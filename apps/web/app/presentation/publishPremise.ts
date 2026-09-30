import {
  CommonErrorCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";
import type { PublishableSubject } from "@repo/core/domain/common/exposureSubject";
import { presentBusinessError } from "./businessErrorCatalog";
import { AppServerError } from "./errorResponse";
import { classifyError, type ErrorState } from "./errorState";

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
 * Save failures that someone else's publication (or suspension) can cause:
 * it moves the version (CS-07), and a published target's save checks the
 * publish condition, before the version for an article (CS-10).
 */
const PREMISE_FIRST: ReadonlySet<ErrorState["kind"]> = new Set([
  "conflict",
  "invalidInput",
]);

/**
 * Failures of the premise read that outrank the save's conflict or input
 * error (`spec/domains/index.md` 「エラーの種類」: the target, then the
 * permission, before the state and the content).
 */
const OUTRANKS: ReadonlySet<ErrorState["kind"]> = new Set([
  "notFound",
  "forbidden",
  "loginRequired",
]);

/**
 * What to report when the save a publish makes first (unsaved changes) fails
 * with a conflict or an input error. The publish's premise is judged first,
 * and CS-08 is shown alone once it is gone (`spec/pages/index.md` CS-08);
 * a premise read refused as CS-17 / CS-05 / CS-04 outranks both. Any other
 * save failure, a premise that still holds, or a read that fails otherwise
 * leaves the save's own error.
 */
export async function publishSaveFailure(
  error: unknown,
  subject: PublishableSubject,
  readPremise: () => Promise<PublishPremise>,
): Promise<unknown> {
  if (!PREMISE_FIRST.has(classifyError(error).kind)) return error;
  let premise: PublishPremise;
  try {
    premise = await readPremise();
  } catch (readError) {
    return OUTRANKS.has(classifyError(readError).kind) ? readError : error;
  }
  const code = lostPublishPremise(subject, premise);
  if (code === null) return error;
  return new AppServerError({
    kind: "business",
    code,
    message: presentBusinessError(code).message,
  });
}
