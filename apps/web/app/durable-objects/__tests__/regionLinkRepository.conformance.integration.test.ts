import { describeRegionLinkRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/regionLinkRepository";
import { createDoHarness } from "./doHarness";

describeRegionLinkRepositoryContract(createDoHarness);
