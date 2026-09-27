import type { CommitCondition } from "../protocol/conditions";
import type { SqlExec } from "../sql";
import { authorityConditionHandlers } from "./authority";

/** Handler table of one condition union: whether each kind holds now. */
export type ConditionHandlersOf<C extends { kind: string }> = {
  readonly [K in C["kind"]]: (
    sql: SqlExec,
    condition: Extract<C, { kind: K }>,
  ) => boolean;
};

export const conditionHandlers = {
  ...authorityConditionHandlers,
} satisfies ConditionHandlersOf<CommitCondition>;

export function conditionHolds(
  sql: SqlExec,
  condition: CommitCondition,
): boolean {
  const handler = (
    conditionHandlers as Readonly<
      Record<
        string,
        ((sql: SqlExec, condition: CommitCondition) => boolean) | undefined
      >
    >
  )[condition.kind];
  if (handler === undefined) {
    throw new Error(`Unknown commit condition: ${condition.kind}`);
  }
  return handler(sql, condition);
}
