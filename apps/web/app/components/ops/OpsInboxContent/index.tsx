import { loadOpsInbox } from "@/presentation/moderationData";
import { OpsInboxView } from "../OpsInboxView";

/** OM-01's four lists, read on the server. */
export async function OpsInboxContent() {
  return <OpsInboxView data={await loadOpsInbox()} />;
}
