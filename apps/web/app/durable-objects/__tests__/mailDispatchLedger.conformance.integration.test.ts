import { describeMailDispatchLedgerContract } from "@repo/core/adapters/do/__conformance__/mailDispatchLedger";
import { createDoHarness } from "./doHarness";

describeMailDispatchLedgerContract(createDoHarness);
