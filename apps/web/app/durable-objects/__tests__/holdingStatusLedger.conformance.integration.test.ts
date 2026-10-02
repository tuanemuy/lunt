import { describeHoldingStatusLedgerContract } from "@repo/core/adapters/durableObject/__conformance__/holdingStatusLedger";
import { createDoHarness } from "./doHarness";

describeHoldingStatusLedgerContract(createDoHarness);
