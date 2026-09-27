import { applicationHarness } from "@repo/core/adapters/do/__conformance__/applicationFixtures";
import { describeApplicationReviewDeskContract } from "@repo/core/adapters/do/__conformance__/applicationReviewDesk";
import { createApplicationDoHarness } from "./applicationDoHarness";

describeApplicationReviewDeskContract(async () =>
  applicationHarness(...(await createApplicationDoHarness())),
);
