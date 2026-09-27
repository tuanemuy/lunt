import type {
  CommandOutcome,
  WriteCommand,
  WriteCommandKind,
} from "../protocol/commands";
import type { SqlExec } from "../sql";

export type CommandHandlers = {
  readonly [K in WriteCommandKind]: (
    sql: SqlExec,
    command: Extract<WriteCommand, { kind: K }>,
  ) => CommandOutcome;
};

export const commandHandlers = {} satisfies CommandHandlers;

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
  )[(command as { kind: string }).kind];
  if (handler === undefined) {
    throw new Error(
      `Unknown write command: ${(command as { kind: string }).kind}`,
    );
  }
  return handler(sql, command);
}
