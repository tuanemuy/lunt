import { createFileRoute } from "@tanstack/react-router";
import {
  InfoReportForm,
  InfoReportRefused,
} from "@/components/moderation/InfoReportForm";
import {
  ReportFailure,
  ReportSkeleton,
  ReportUnavailable,
} from "@/components/moderation/ReportParts";
import {
  infoReportSearchSchema,
  loadInfoReportPageFn,
} from "@/presentation/moderation";
import { requireLogin } from "@/presentation/session";

const HEADING = "情報の誤り・閉店を連絡する";

/**
 * RQ-08 情報の誤り・閉店の連絡 (`/info-report/{place|listing}/$id`):
 * login required (CS-04). A store without stewards opens as 受け付けない;
 * a target viewers cannot see as CS-06. `?from=` names the application
 * screen that sent the user here from its 受け付けない state.
 */
export const Route = createFileRoute("/_report/info-report/$kind/$id")({
  validateSearch: infoReportSearchSchema,
  beforeLoad: ({ location }) => requireLogin(location),
  loader: ({ params }) =>
    loadInfoReportPageFn({ data: { kind: params.kind, id: params.id } }),
  head: () => ({ meta: [{ title: "情報の誤り・閉店の連絡 — Lunt" }] }),
  pendingComponent: () => (
    <ReportSkeleton
      heading={HEADING}
      label="連絡の対象を読み込んでいます"
      middle="chip"
    />
  ),
  errorComponent: () => (
    <ReportFailure heading={HEADING} title="連絡の対象を読み込めませんでした" />
  ),
  component: InfoReportPage,
});

function InfoReportPage() {
  const page = Route.useLoaderData();
  const { kind, id } = Route.useParams();
  const { from } = Route.useSearch();
  switch (page.kind) {
    case "unavailable":
      return <ReportUnavailable heading={HEADING} noun="連絡" />;
    case "refused":
      return <InfoReportRefused target={page.target} place={page.place} />;
    case "form":
      return (
        <InfoReportForm
          key={`${kind}:${id}`}
          target={page.target}
          place={page.place}
          from={from ?? null}
        />
      );
  }
}
