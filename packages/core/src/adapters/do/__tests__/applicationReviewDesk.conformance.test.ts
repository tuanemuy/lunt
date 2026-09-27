import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeApplicationReviewDeskContract } from "../__conformance__/applicationReviewDesk";
import { createNodeHarness } from "../testing/nodeHarness";

describeApplicationReviewDeskContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base.state.client, UuidV7Generator, () =>
    base.savedEvents(),
  );
});
