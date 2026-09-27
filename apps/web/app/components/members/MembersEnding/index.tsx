"use client";

import { createContext, useContext } from "react";

/**
 * Lets CM-02's board tell its frame that the viewer no longer manages the
 * target (辞任済み, or found no longer a manager): the frame then drops
 * the target's management nav and switcher (「対象の管理の入口は示さない」).
 * The board streams in as an RSC payload, so a callback prop cannot reach
 * it; context does.
 */
export const MembersEndingContext = createContext<() => void>(() => {});

export function useEndMembership(): () => void {
  return useContext(MembersEndingContext);
}
