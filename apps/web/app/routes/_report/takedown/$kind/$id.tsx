import { createFileRoute } from "@tanstack/react-router";
import {
  ReportFailure,
  ReportSkeleton,
  ReportUnavailable,
} from "@/components/moderation/ReportParts";
import { TakedownClaimForm } from "@/components/moderation/TakedownClaimForm";
import { loadTakedownPageFn } from "@/presentation/moderation";

const HEADING = "取り下げを申し立てる";

/**
 * RQ-07 取り下げの申立て (`/takedown/{place|listing|region|occasion}/$id`): no login.
 * Interactive from the start, so a plain loader reads the target; a
 * target viewers cannot see opens as CS-06.
 */
export const Route = createFileRoute("/_report/takedown/$kind/$id")({
  loader: ({ params }) =>
    loadTakedownPageFn({ data: { kind: params.kind, id: params.id } }),
  head: () => ({ meta: [{ title: "取り下げの申立て — Lunt" }] }),
  pendingComponent: () => (
    <ReportSkeleton
      heading={HEADING}
      label="申立ての対象を読み込んでいます"
      middle="field"
    />
  ),
  errorComponent: () => (
    <ReportFailure
      heading={HEADING}
      title="申立ての対象を読み込めませんでした"
    />
  ),
  component: TakedownPage,
});

function TakedownPage() {
  const page = Route.useLoaderData();
  const { kind, id } = Route.useParams();
  if (page.kind === "unavailable") {
    return <ReportUnavailable heading={HEADING} noun="申立て" />;
  }
  return (
    <TakedownClaimForm
      key={`${kind}:${id}`}
      target={page.target}
      photos={page.photos}
    />
  );
}
