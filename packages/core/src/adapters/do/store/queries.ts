import type { QueryArgs, QueryName, QueryResult } from "../protocol/queries";
import type { SqlExec } from "../sql";

export type QueryHandlers = {
  readonly [K in QueryName]: (
    sql: SqlExec,
    args: QueryArgs<K>,
  ) => QueryResult<K>;
};

export const queryHandlers = {} satisfies QueryHandlers;

export function runQuery<K extends QueryName>(
  sql: SqlExec,
  name: K,
  args: QueryArgs<K>,
): QueryResult<K> {
  const handler = (
    queryHandlers as Readonly<
      Record<string, ((sql: SqlExec, args: unknown) => unknown) | undefined>
    >
  )[name];
  if (handler === undefined) {
    throw new Error(`Unknown query: ${name}`);
  }
  return handler(sql, args) as QueryResult<K>;
}
