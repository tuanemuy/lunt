import { describePlaceAffiliationsRepositoryContract } from "@repo/core/adapters/do/__conformance__/placeAffiliationsRepository";
import { createDoHarness } from "./doHarness";

describePlaceAffiliationsRepositoryContract(createDoHarness);
