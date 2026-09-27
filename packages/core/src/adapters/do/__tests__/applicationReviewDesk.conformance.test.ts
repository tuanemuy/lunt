import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeApplicationReviewDeskContract } from "../__conformance__/applicationReviewDesk";
import { createNodeHarness } from "../testing/nodeHarness";

describeApplicationReviewDeskContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base, base.state.client);
});
