import { describeRegionRepositoryContract } from "@repo/core/adapters/do/__conformance__/regionRepository";
import { createDoHarness } from "./doHarness";

describeRegionRepositoryContract(createDoHarness);
