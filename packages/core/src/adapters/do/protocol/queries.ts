import type { AccountQueries } from "./account";
import type { ApplicationQueries } from "./application";
import type { AreaQueries } from "./area";
import type { AuthorityQueries } from "./authority";
import type { DiscoveryQueries } from "./discovery";
import type { ListingQueries } from "./listing";
import type { MediaQueries } from "./media";
import type { ModerationQueries } from "./moderation";
import type { NotificationQueries } from "./notification";
import type { PlaceQueries } from "./place";

/**
 * Named reads the request side can run against the Lunt state Durable
 * Object. Each domain contributes one fragment (`{ "<domain>.<read>":
 * QuerySpec<args, result> }`); the catalog is their intersection, and
 * the DO-side handler table (`store/queries.ts`) must cover every key —
 * enforced with `satisfies QueryHandlers`.
 *
 * Arguments and results cross Workers RPC, so they are plain
 * structured-clonable data: strings, numbers, booleans, `Date`, arrays
 * and plain objects. Results are at-rest records; the request-side
 * repository runs the aggregate's `reconstruct` over them.
 */
export type QuerySpec<TArgs, TResult> = Readonly<{
  args: TArgs;
  result: TResult;
}>;

export type QueryCatalog = AccountQueries &
  AuthorityQueries &
  ApplicationQueries &
  NotificationQueries &
  ModerationQueries &
  AreaQueries &
  MediaQueries &
  PlaceQueries &
  ListingQueries &
  DiscoveryQueries;

export type QueryName = keyof QueryCatalog & string;

export type QueryArgs<K extends QueryName> =
  QueryCatalog[K] extends QuerySpec<infer A, unknown> ? A : never;

export type QueryResult<K extends QueryName> =
  QueryCatalog[K] extends QuerySpec<unknown, infer R> ? R : never;
