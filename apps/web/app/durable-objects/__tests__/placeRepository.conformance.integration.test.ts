import { describePlaceRepositoryContract } from "@repo/core/adapters/do/__conformance__/placeRepository";
import { createDoHarness } from "./doHarness";

describePlaceRepositoryContract(createDoHarness);
