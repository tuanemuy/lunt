import { classifyError } from "@/presentation/errorState";
import type { InfoReportData } from "@/presentation/moderation";
import { loadInfoReport } from "@/presentation/moderationData";
import { InfoReportProblem, InfoReportView } from "../InfoReportView";

/** OM-05's report, read on the server; `InfoReportView` owns the operations. */
export async function InfoReportContent({ reportId }: { reportId: string }) {
  let data: InfoReportData;
  try {
    data = await loadInfoReport(reportId);
  } catch (error) {
    return (
      <InfoReportProblem missing={classifyError(error).kind === "notFound"} />
    );
  }
  return <InfoReportView key={reportId} data={data} />;
}
