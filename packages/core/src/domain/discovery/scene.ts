/**
 * The context a published target is shown in. `discovery` finds new places
 * to visit and hides what is not discoverable; `reference` checks a named
 * target (or one tied to it) and shows it with its standing.
 */
export type Scene = "discovery" | "reference";

export const Scene = {
  values: ["discovery", "reference"] as const satisfies readonly Scene[],
  isScene: (value: string): value is Scene =>
    value === "discovery" || value === "reference",
};
