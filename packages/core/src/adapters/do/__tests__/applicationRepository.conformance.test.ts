import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeApplicationRepositoryContract } from "../__conformance__/applicationRepository";
import { createNodeHarness } from "../testing/nodeHarness";

describeApplicationRepositoryContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base, base.state.client);
});
