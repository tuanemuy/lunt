import { applicationHarness } from "@repo/core/adapters/durableObject/__conformance__/applicationFixtures";
import { describeApplicationReviewDeskContract } from "@repo/core/adapters/durableObject/__conformance__/applicationReviewDesk";
import { createApplicationDoHarness } from "./applicationDoHarness";

describeApplicationReviewDeskContract(async () =>
  applicationHarness(...(await createApplicationDoHarness())),
);
