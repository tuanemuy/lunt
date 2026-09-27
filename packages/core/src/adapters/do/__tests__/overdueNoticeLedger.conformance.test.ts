import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeOverdueNoticeLedgerContract } from "../__conformance__/overdueNoticeLedger";
import { createNodeHarness } from "../testing/nodeHarness";

describeOverdueNoticeLedgerContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base, base.state.client);
});
