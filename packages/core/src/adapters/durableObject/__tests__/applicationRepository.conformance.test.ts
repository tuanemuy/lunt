import { UuidV7Generator } from "@repo/core/application/ports/idGenerator";
import { applicationHarness } from "../__conformance__/applicationFixtures";
import { describeApplicationRepositoryContract } from "../__conformance__/applicationRepository";
import { createNodeHarness } from "../testing/nodeHarness";

describeApplicationRepositoryContract(async () => {
  const base = createNodeHarness();
  return applicationHarness(base.state.client, UuidV7Generator, () =>
    base.savedEvents(),
  );
});
