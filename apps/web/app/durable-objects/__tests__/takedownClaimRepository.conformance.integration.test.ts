import { describeTakedownClaimRepositoryContract } from "@repo/core/adapters/do/__conformance__/takedownClaimRepository";
import { createDoHarness } from "./doHarness";

describeTakedownClaimRepositoryContract(createDoHarness);
