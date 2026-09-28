import { createFileRoute } from "@tanstack/react-router";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OpsInboxSkeleton } from "@/components/ops/OpsInboxSkeleton";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import { opsInboxSearchSchema } from "@/presentation/moderation";
import { renderOpsInbox } from "./-render";

/**
 * OM-01 対応が必要なもの (`/ops`, `?kind=` marks the kind jumped to): the
 * home of the service-operation area, which MY-01 and the operator role's
 * grant notification open. The `_manage/ops` layout has refused
 * non-operators (CS-05).
 */
export const Route = createFileRoute("/_manage/ops/")({
  validateSearch: opsInboxSearchSchema,
  loader: async () => {
    const { Inbox } = await renderOpsInbox();
    return { Inbox };
  },
  head: () => ({ meta: [{ title: "対応が必要なもの — Lunt" }] }),
  component: OpsInboxPage,
});

function OpsInboxPage() {
  const { Inbox } = Route.useLoaderData();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>対応が必要なもの</ManageHeading>
        </ManageTitle>
      }
      nav={<OpsNav />}
    >
      <Deferred
        promise={Inbox}
        fallback={
          <OpsInboxSkeleton label="対応が必要なものを読み込んでいます" />
        }
      />
    </ManagePage>
  );
}
