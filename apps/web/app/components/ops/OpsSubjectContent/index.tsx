import { classifyError } from "@/presentation/errorState";
import { loadOpsSubject } from "@/presentation/opsData";
import type { OpsSubjectData, OpsSubjectKind } from "@/presentation/opsSubject";
import { OpsSubjectProblem, OpsSubjectView } from "../OpsSubjectView";

/** OM-03's subject, read on the server; `OpsSubjectView` owns the suspension. */
export async function OpsSubjectContent({
  kind,
  id,
}: {
  kind: OpsSubjectKind;
  id: string;
}) {
  let data: OpsSubjectData;
  try {
    data = await loadOpsSubject(kind, id);
  } catch (error) {
    return (
      <OpsSubjectProblem
        kind={kind}
        missing={classifyError(error).kind === "notFound"}
      />
    );
  }
  return <OpsSubjectView key={`${kind}:${id}`} data={data} />;
}
