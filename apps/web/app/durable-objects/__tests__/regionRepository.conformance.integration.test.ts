import { describeRegionRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/regionRepository";
import { createDoHarness } from "./doHarness";

describeRegionRepositoryContract(createDoHarness);
