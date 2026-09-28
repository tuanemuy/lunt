"use client";

import { createContext, type ReactNode, useContext } from "react";

/** RQ-04's steps kept in the URL: the form, or 見え方の確認 (`?step=preview`). */
export type ListingStep = "input" | "preview";

type ListingStepValue = Readonly<{
  step: ListingStep;
  /** Opens the preview (a history entry, so Back returns to the form). */
  openPreview: () => void;
  /** Back to the form, the input kept (the form is never remounted). */
  closePreview: () => void;
}>;

const ListingStepContext = createContext<ListingStepValue | null>(null);

/**
 * The route's step, handed to the form inside the RSC payload: the form is
 * rendered on the server and cannot read the route's search itself, and a
 * step change must not re-run the loader (the input lives in the form).
 */
export function ListingStepProvider({
  value,
  children,
}: {
  value: ListingStepValue;
  children: ReactNode;
}) {
  return (
    <ListingStepContext.Provider value={value}>
      {children}
    </ListingStepContext.Provider>
  );
}

export function useListingStep(): ListingStepValue {
  const value = useContext(ListingStepContext);
  if (value === null) {
    throw new Error("useListingStep needs a ListingStepProvider");
  }
  return value;
}
