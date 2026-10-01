import {
  loadMembershipPage,
  loadParticipationPage,
} from "@/presentation/applyRelationsData";
import {
  type MembershipEntry,
  membershipHeading,
  type ParticipationEntry,
  participationHeading,
  type RelationPage,
} from "@/presentation/applyRelationsView";
import type { ApplyMode } from "@/presentation/applyView";
import type { ErrorState } from "@/presentation/errorState";
import { readFailureState } from "@/presentation/readFailure";
import { ApplyProblem } from "../ApplyParts";
import { MembershipForm } from "../MembershipForm";
import { ParticipationForm } from "../ParticipationForm";
import { RelationRefused } from "../RelationParts";

/*
 * RQ-05 and RQ-06's bodies, read on the server; the forms own the input
 * and the submission. A load that fails renders its own common state
 * here, since an error thrown inside the RSC render reaches the browser
 * redacted.
 */

async function read<D>(
  load: () => Promise<RelationPage<D>>,
): Promise<RelationPage<D> | Readonly<{ kind: "problem"; state: ErrorState }>> {
  try {
    return await load();
  } catch (error) {
    return { kind: "problem", state: await readFailureState(error) };
  }
}

/** A resubmission's version keys the form, so reading it again after CS-07 starts afresh. */
const formKey = (mode: ApplyMode): string =>
  mode.kind === "resubmit"
    ? `${mode.applicationId}:${mode.version}`
    : mode.kind === "reapply"
      ? `reapply:${mode.from}`
      : "new";

/** RQ-05. */
export async function MembershipContent({ entry }: { entry: MembershipEntry }) {
  const page = await read(() => loadMembershipPage(entry));
  switch (page.kind) {
    case "problem":
      return (
        <ApplyProblem
          heading={membershipHeading(entry)}
          kind={page.state.kind}
        />
      );
    case "refused":
      return (
        <RelationRefused
          heading={membershipHeading(entry)}
          refusal={page.refusal}
          what="membership"
        />
      );
    case "form":
      return <MembershipForm key={formKey(page.data.mode)} data={page.data} />;
  }
}

/** RQ-06. */
export async function ParticipationApplyContent({
  entry,
}: {
  entry: ParticipationEntry;
}) {
  const page = await read(() => loadParticipationPage(entry));
  switch (page.kind) {
    case "problem":
      return (
        <ApplyProblem
          heading={participationHeading(entry)}
          kind={page.state.kind}
        />
      );
    case "refused":
      return (
        <RelationRefused
          heading={participationHeading(entry)}
          refusal={page.refusal}
          what="participation"
        />
      );
    case "form":
      return (
        <ParticipationForm key={formKey(page.data.mode)} data={page.data} />
      );
  }
}
