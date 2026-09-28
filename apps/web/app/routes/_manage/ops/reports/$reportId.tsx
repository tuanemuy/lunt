import { createFileRoute } from "@tanstack/react-router";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OpsInboxSkeleton } from "@/components/ops/OpsInboxSkeleton";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderInfoReport } from "../-render";

/**
 * OM-05 連絡の対応 (`/ops/reports/$reportId`), opened from OM-01, the
 * operators' info-report notification, and the absence proxy's way back.
 */
export const Route = createFileRoute("/_manage/ops/reports/$reportId")({
  loader: async ({ params }) => {
    const { Report } = await renderInfoReport({
      data: { id: params.reportId },
    });
    return { Report };
  },
  head: () => ({ meta: [{ title: "連絡の対応 — Lunt" }] }),
  component: InfoReportPage,
});

function InfoReportPage() {
  const { Report } = Route.useLoaderData();
  return (
    <Deferred
      promise={Report}
      fallback={
        <ManagePage
          title={
            <ManageTitle>
              <ManageHeading>連絡の対応</ManageHeading>
            </ManageTitle>
          }
          nav={<OpsNav current="inbox" />}
        >
          <OpsInboxSkeleton label="連絡を読み込んでいます" />
        </ManagePage>
      }
    />
  );
}
