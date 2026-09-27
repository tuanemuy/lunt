import type { CommandOutcome, WriteCommand } from "../protocol/commands";
import type { SqlExec } from "../sql";
import { accountCommandHandlers } from "./account";

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
