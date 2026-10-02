import type { AuthorityCondition } from "./authority";

/**
 * Conditions a unit of work's commit must still meet (`CommitRequest`).
 * Each domain contributes a union of `{ kind: "<domain>.<condition>" }`;
 * the DO-side table (`store/conditions.ts`) must cover every `kind`. The
 * object checks them inside the commit's transaction, before any write,
 * and refuses the whole unit of work at the first that does not hold —
 * the request side turns that into `ForbiddenError`. They carry the
 * "still allowed when it commits" rules of `spec/usecases/*.md` (e.g. an
 * operator whose role is revoked before the commit).
 */
export type CommitCondition = AuthorityCondition;

export type CommitConditionKind = CommitCondition["kind"];
