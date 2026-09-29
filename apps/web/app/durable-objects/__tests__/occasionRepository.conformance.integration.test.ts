import { describeOccasionRepositoryContract } from "@repo/core/adapters/do/__conformance__/occasionRepository";
import { createDoHarness } from "./doHarness";

describeOccasionRepositoryContract(createDoHarness);
