import { describeListingRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/listingRepository";
import { createDoHarness } from "./doHarness";

describeListingRepositoryContract(createDoHarness);
