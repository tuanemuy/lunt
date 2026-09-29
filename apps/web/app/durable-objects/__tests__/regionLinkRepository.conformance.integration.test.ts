import { describeRegionLinkRepositoryContract } from "@repo/core/adapters/do/__conformance__/regionLinkRepository";
import { createDoHarness } from "./doHarness";

describeRegionLinkRepositoryContract(createDoHarness);
