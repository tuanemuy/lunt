"use client";

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { deviceMerger } from "@/presentation/deviceSaveStore";
import { safeNextPath } from "@/presentation/nextPath";
import { LoginSucceeded } from "../LoginFlow";

/**
 * MY-02's last step after a login the server finished (the external
 * account's callback): as the code and link logins do before they move on,
 * merges this browser's device saves into the account (KEP-04) — a failed
 * merge leaves them on the device and VW-10 shows 「引き継ぎの未了」 — then
 * reloads and goes to where the login started.
 */
export function LoginDone({ next }: { next: string | undefined }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      await deviceMerger.merge();
      await router.invalidate({ sync: true });
      router.history.replace(safeNextPath(next));
    })();
  }, [next, router]);

  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>ログイン</ManageHeading>
        </ManageTitle>
      }
    >
      <LoginSucceeded />
    </ManagePage>
  );
}
