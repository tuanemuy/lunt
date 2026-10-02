import { describeOccasionRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/occasionRepository";
import { createDoHarness } from "./doHarness";

describeOccasionRepositoryContract(createDoHarness);
