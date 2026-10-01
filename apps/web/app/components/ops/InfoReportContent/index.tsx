import type { InfoReportData } from "@/presentation/moderation";
import { loadInfoReport } from "@/presentation/moderationData";
import { readFailureState } from "@/presentation/readFailure";
import { InfoReportProblem, InfoReportView } from "../InfoReportView";

/** OM-05's report, read on the server; `InfoReportView` owns the operations. */
export async function InfoReportContent({ reportId }: { reportId: string }) {
  let data: InfoReportData;
  try {
    data = await loadInfoReport(reportId);
  } catch (error) {
    return (
      <InfoReportProblem
        missing={(await readFailureState(error)).kind === "notFound"}
      />
    );
  }
  return <InfoReportView key={reportId} data={data} />;
}
