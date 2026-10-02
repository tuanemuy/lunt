import { describePlaceRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/placeRepository";
import { createDoHarness } from "./doHarness";

describePlaceRepositoryContract(createDoHarness);
