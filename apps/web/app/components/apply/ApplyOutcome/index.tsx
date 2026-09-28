"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const OutcomeContext = createContext<((view: ReactNode) => void) | null>(null);

/**
 * Holds a submission's outcome (CS-13, or 「受け付けない」 met at
 * submission) above the RSC payload, in the route's component. The page's
 * loader may run again after the submission (the router reloads a route on
 * reconnecting, a retry reloads it), and the body it renders now refuses
 * the screen — the application just submitted is active — which would
 * replace the form, and the outcome with it. The route keys it by its URL,
 * so another opening starts afresh.
 */
export function ApplyOutcomeBoundary({ children }: { children: ReactNode }) {
  const [outcome, setOutcome] = useState<ReactNode | null>(null);
  if (outcome !== null) return outcome;
  return (
    <OutcomeContext.Provider value={setOutcome}>
      {children}
    </OutcomeContext.Provider>
  );
}

/**
 * Renders `view` and hands it to the boundary, which keeps showing it
 * whatever the page's body becomes. Outside a boundary it only renders.
 */
export function KeepOutcome({ view }: { view: ReactNode }) {
  const keep = useContext(OutcomeContext);
  useEffect(() => {
    keep?.(view);
  }, [keep, view]);
  return view;
}
