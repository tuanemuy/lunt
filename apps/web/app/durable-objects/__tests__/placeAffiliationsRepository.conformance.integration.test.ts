import { describePlaceAffiliationsRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/placeAffiliationsRepository";
import { createDoHarness } from "./doHarness";

describePlaceAffiliationsRepositoryContract(createDoHarness);
