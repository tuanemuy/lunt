import { createFileRoute } from "@tanstack/react-router";
import { DevStewards } from "@/components/dev/DevStewards";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { requireDevTools } from "@/presentation/devTools";

/**
 * Development tool: give a store its first steward, standing in for the
 * stewardship-claim approval of S2B (`docs/manual_test.md`).
 */
export const Route = createFileRoute("/__dev/stewards")({
  beforeLoad: () => requireDevTools(),
  head: () => ({ meta: [{ title: "Stewards — Lunt" }] }),
  component: StewardsPage,
});

function StewardsPage() {
  return (
    <ManageShell context="開発用" homeTo="/">
      <ManagePage
        title={
          <ManageTitle>
            <ManageHeading>店舗管理者を入れる</ManageHeading>
          </ManageTitle>
        }
      >
        <ManageBody>
          <p className="m-field__help">
            管理権限の申請の承認（S2B）の代わりに、アカウントを店舗の店舗管理者にします。アカウントは先にログインして作っておきます。
          </p>
          <DevStewards />
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}
