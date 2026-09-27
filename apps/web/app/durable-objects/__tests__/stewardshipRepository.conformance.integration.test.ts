import { describeStewardshipRepositoryContract } from "@repo/core/adapters/do/__conformance__/stewardshipRepository";
import { createDoHarness } from "./doHarness";

describeStewardshipRepositoryContract(createDoHarness);
