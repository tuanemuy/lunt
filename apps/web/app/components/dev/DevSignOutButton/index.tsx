"use client";

import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { devSignOutFn } from "@/presentation/devSession";
import { displayError } from "@/presentation/errorDisplay";

/** Development tool: forget this browser's login, then re-check the page. */
export function DevSignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error === null ? null : <Alert title={error} />}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await devSignOutFn();
              setError(null);
              await router.invalidate({ sync: true });
            } catch (thrown) {
              setError(displayError(thrown));
            }
          })
        }
      >
        ログアウトする（開発用）
      </Button>
    </>
  );
}
