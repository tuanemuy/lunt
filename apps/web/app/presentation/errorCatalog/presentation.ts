/**
 * How a business rule violation is shown (`spec/pages/index.md`):
 * - `invalidInput` CS-10 — what the user entered or chose cannot be saved
 *   as it is; the screen points at the items (`missing` for an unmet
 *   publish condition).
 * - `premiseChanged` CS-08 — the target's state changed under the
 *   operation (someone else acted first, or time passed); the screen shows
 *   the current state.
 */
export type BusinessErrorPresentation = Readonly<{
  state: "invalidInput" | "premiseChanged";
  message: string;
}>;

export const invalid = (message: string): BusinessErrorPresentation => ({
  state: "invalidInput",
  message,
});

export const changed = (message: string): BusinessErrorPresentation => ({
  state: "premiseChanged",
  message,
});
