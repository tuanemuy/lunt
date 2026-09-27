import { applicationHarness } from "@repo/core/adapters/do/__conformance__/applicationFixtures";
import { describeOverdueNoticeLedgerContract } from "@repo/core/adapters/do/__conformance__/overdueNoticeLedger";
import { createApplicationDoHarness } from "./applicationDoHarness";

describeOverdueNoticeLedgerContract(async () =>
  applicationHarness(...(await createApplicationDoHarness())),
);
