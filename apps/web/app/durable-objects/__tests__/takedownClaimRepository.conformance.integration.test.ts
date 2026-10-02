import { describeTakedownClaimRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/takedownClaimRepository";
import { createDoHarness } from "./doHarness";

describeTakedownClaimRepositoryContract(createDoHarness);
