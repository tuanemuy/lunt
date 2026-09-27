"use client";

import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { IconButtonLink } from "@/components/ui/IconButton";

/**
 * The detail header's 戻る. Goes back in history when there is an in-app
 * entry to return to; otherwise (a deep link from a notification mail) it is
 * a plain link to `fallback`.
 */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <IconButtonLink
      to={fallback}
      icon="back"
      label="戻る"
      neutral
      onClick={(event) => {
        if (!canGoBack) return;
        event.preventDefault();
        router.history.back();
      }}
    />
  );
}
