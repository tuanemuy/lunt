import type { AccountCommand } from "./account";
import type { ApplicationCommand } from "./application";
import type { AreaCommand } from "./area";
import type { AuthorityCommand } from "./authority";
import type { DiscoveryCommand } from "./discovery";
import type { ListingCommand } from "./listing";
import type { MediaCommand } from "./media";
import type { ModerationCommand } from "./moderation";
import type { NotificationCommand } from "./notification";
import type { PlaceCommand } from "./place";

/**
 * Buffered writes of one unit of work. Each domain contributes a union
 * of `{ kind: "<domain>.<write>", ... }` commands; the DO-side handler
 * table (`store/commands.ts`) must cover every `kind`.
 *
 * Commands carry the aggregate snapshot the domain behaviour produced.
 * Derived index columns (normalized search text, derived dates, reverse
 * indexes) are computed by the DO-side handler from that snapshot, so an
 * index can never drift from the aggregate it was derived from.
 */
export type WriteCommand =
  | AccountCommand
  | AuthorityCommand
  | ApplicationCommand
  | NotificationCommand
  | AreaCommand
  | MediaCommand
  | PlaceCommand
  | ListingCommand
  | DiscoveryCommand
  | ModerationCommand;

export type WriteCommandKind = WriteCommand["kind"];

/**
 * Why a single command could not be applied. Returned as data — Workers
 * RPC turns thrown errors into plain `Error`s, so class identity would
 * not survive the wire.
 *
 * - `conflict` / `OPTIMISTIC_LOCK_FAILURE`: the stored version differs
 *   from the expected one.
 * - `conflict` / `UNIQUE_VIOLATION`: an id or a port-guarded unique key
 *   is already taken.
 * - `notFound`: `save` / `delete` targeted an aggregate that does not
 *   exist (never inserted, or deleted).
 */
export type WriteFailure =
  | Readonly<{
      kind: "conflict";
      code: "OPTIMISTIC_LOCK_FAILURE" | "UNIQUE_VIOLATION";
      message: string;
    }>
  | Readonly<{ kind: "notFound"; code: string; message: string }>;

export type CommandOutcome = Readonly<{ kind: "applied" }> | WriteFailure;
