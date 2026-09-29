import { describeHoldingStatusLedgerContract } from "@repo/core/adapters/do/__conformance__/holdingStatusLedger";
import { createDoHarness } from "./doHarness";

describeHoldingStatusLedgerContract(createDoHarness);
