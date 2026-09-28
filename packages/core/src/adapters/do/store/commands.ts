import type { CommandOutcome, WriteCommand } from "../protocol/commands";
import type { SqlExec } from "../sql";
import { accountCommandHandlers } from "./account";
import { applicationCommandHandlers } from "./application";
import { areaCommandHandlers } from "./area";
import { authorityCommandHandlers } from "./authority";
import { discoveryCommandHandlers } from "./discovery";
import { listingCommandHandlers } from "./listing";
import { mediaCommandHandlers } from "./media";
import { moderationCommandHandlers } from "./moderation";
import { notificationCommandHandlers } from "./notification";
import { placeCommandHandlers } from "./place";

/** Handler table of one command union: one synchronous writer per kind. */
export type CommandHandlersOf<C extends { kind: string }> = {
  readonly [K in C["kind"]]: (
    sql: SqlExec,
    command: Extract<C, { kind: K }>,
  ) => CommandOutcome;
};

export type CommandHandlers = CommandHandlersOf<WriteCommand>;

export const commandHandlers = {
  ...accountCommandHandlers,
  ...authorityCommandHandlers,
  ...applicationCommandHandlers,
  ...notificationCommandHandlers,
  ...areaCommandHandlers,
  ...mediaCommandHandlers,
  ...placeCommandHandlers,
  ...listingCommandHandlers,
  ...discoveryCommandHandlers,
  ...moderationCommandHandlers,
} satisfies CommandHandlers;

export function applyCommand(
  sql: SqlExec,
  command: WriteCommand,
): CommandOutcome {
  const handler = (
    commandHandlers as Readonly<
      Record<
        string,
        ((sql: SqlExec, command: WriteCommand) => CommandOutcome) | undefined
      >
    >
  )[command.kind];
  if (handler === undefined) {
    throw new Error(`Unknown write command: ${command.kind}`);
  }
  return handler(sql, command);
}
