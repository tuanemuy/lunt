import { applicationHarness } from "@repo/core/adapters/do/__conformance__/applicationFixtures";
import { describeApplicationRepositoryContract } from "@repo/core/adapters/do/__conformance__/applicationRepository";
import { createApplicationDoHarness } from "./applicationDoHarness";

describeApplicationRepositoryContract(async () =>
  applicationHarness(...(await createApplicationDoHarness())),
);
