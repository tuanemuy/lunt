import { createFileRoute } from "@tanstack/react-router";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OpsInboxSkeleton } from "@/components/ops/OpsInboxSkeleton";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderTakedownClaim } from "../-render";

/**
 * OM-04 申立ての対応 (`/ops/takedowns/$claimId`), opened from OM-01 and
 * the operators' takedown-claim notification.
 */
export const Route = createFileRoute("/_manage/ops/takedowns/$claimId")({
  loader: async ({ params }) => {
    const { Claim } = await renderTakedownClaim({
      data: { id: params.claimId },
    });
    return { Claim };
  },
  head: () => ({ meta: [{ title: "申立ての対応 — Lunt" }] }),
  component: TakedownClaimPage,
});

function TakedownClaimPage() {
  const { Claim } = Route.useLoaderData();
  return (
    <Deferred
      promise={Claim}
      fallback={
        <ManagePage
          title={
            <ManageTitle>
              <ManageHeading>申立ての対応</ManageHeading>
            </ManageTitle>
          }
          nav={<OpsNav current="inbox" />}
        >
          <OpsInboxSkeleton label="申立てを読み込んでいます" />
        </ManagePage>
      }
    />
  );
}
