import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeOverdueNoticeLedgerContract } from "../__conformance__/overdueNoticeLedger";
import { createNodeHarness } from "../testing/nodeHarness";

describeOverdueNoticeLedgerContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base.state.client, UuidV7Generator, () =>
    base.savedEvents(),
  );
});
