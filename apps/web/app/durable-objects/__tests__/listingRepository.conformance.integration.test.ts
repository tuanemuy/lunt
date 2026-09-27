import { describeListingRepositoryContract } from "@repo/core/adapters/do/__conformance__/listingRepository";
import { createDoHarness } from "./doHarness";

describeListingRepositoryContract(createDoHarness);
