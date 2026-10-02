import { describeOfferingPhaseLedgerContract } from "@repo/core/adapters/durableObject/__conformance__/offeringPhaseLedger";
import { createDoHarness } from "./doHarness";

describeOfferingPhaseLedgerContract(createDoHarness);
