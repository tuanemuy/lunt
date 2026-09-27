import type { MemberTargetInput } from "@/presentation/members";
import { loadMemberBoard } from "@/presentation/membersData";
import { MemberBoard } from "../MemberBoard";

/** CM-02's lists, rendered on the server for the viewer's standing. */
export async function MemberBoardContent({
  target,
}: {
  target: MemberTargetInput;
}) {
  return <MemberBoard data={await loadMemberBoard(target)} />;
}
