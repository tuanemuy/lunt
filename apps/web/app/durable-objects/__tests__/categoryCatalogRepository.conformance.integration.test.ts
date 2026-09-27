import { describeCategoryCatalogRepositoryContract } from "@repo/core/adapters/do/__conformance__/categoryCatalogRepository";
import { createDoHarness } from "./doHarness";

describeCategoryCatalogRepositoryContract(createDoHarness);
