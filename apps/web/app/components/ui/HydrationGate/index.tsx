"use client";

import { type ReactNode, useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` in the server render and while this component hydrates, `true`
 * from the render right after it hydrated (and on every client render).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Keeps the form controls inside disabled until the island holding them has
 * hydrated. A value typed into the server-rendered markup before then stays
 * on screen, but React never hears of it: the island's state keeps the
 * loaded value, a save sends that one, and the next render of the field puts
 * it back. Rendered inside the island's own hydration unit (the form), so it
 * opens together with the handlers it waits for. Its box is `contents`: it
 * does not change the form's layout.
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return (
    <fieldset
      className="contents"
      disabled={!hydrated}
      aria-busy={hydrated ? undefined : true}
    >
      {children}
    </fieldset>
  );
}
