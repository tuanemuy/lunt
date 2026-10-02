import { describeStewardshipRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/stewardshipRepository";
import { createDoHarness } from "./doHarness";

describeStewardshipRepositoryContract(createDoHarness);
