import type {
  QueryArgs,
  QueryCatalog,
  QueryName,
  QueryResult,
} from "../protocol/queries";
import type { SqlExec } from "../sql";
import { accountQueryHandlers } from "./account";
import { applicationQueryHandlers } from "./application";
import { areaQueryHandlers } from "./area";
import { authorityQueryHandlers } from "./authority";
import { discoveryQueryHandlers } from "./discovery";
import { listingQueryHandlers } from "./listing";
import { mediaQueryHandlers } from "./media";
import { moderationQueryHandlers } from "./moderation";
import { notificationQueryHandlers } from "./notification";
import { placeQueryHandlers } from "./place";

/** Handler table of one catalog fragment: one synchronous reader per name. */
export type QueryHandlersOf<Q> = {
  readonly [K in keyof Q]: Q[K] extends { args: infer A; result: infer R }
    ? (sql: SqlExec, args: A) => R
    : never;
};

export type QueryHandlers = QueryHandlersOf<QueryCatalog>;

export const queryHandlers = {
  ...accountQueryHandlers,
  ...authorityQueryHandlers,
  ...applicationQueryHandlers,
  ...notificationQueryHandlers,
  ...moderationQueryHandlers,
  ...areaQueryHandlers,
  ...mediaQueryHandlers,
  ...placeQueryHandlers,
  ...listingQueryHandlers,
  ...discoveryQueryHandlers,
} satisfies QueryHandlers;

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
