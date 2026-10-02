import { describeCategoryCatalogRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/categoryCatalogRepository";
import { createDoHarness } from "./doHarness";

describeCategoryCatalogRepositoryContract(createDoHarness);
