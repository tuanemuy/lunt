import { describeMailDispatchLedgerContract } from "@repo/core/adapters/durableObject/__conformance__/mailDispatchLedger";
import { createDoHarness } from "./doHarness";

describeMailDispatchLedgerContract(createDoHarness);
