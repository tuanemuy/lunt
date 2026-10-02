/**
 * The outcome of advancing the development clock, as data (Workers RPC
 * would strip an error's class).
 */
export type DevClockAdvance =
  | Readonly<{ kind: "advanced"; offsetMs: number }>
  | Readonly<{ kind: "refused"; reason: string }>;
