import { describeBookmarkRepositoryContract } from "@repo/core/adapters/do/__conformance__/bookmarkRepository";
import { createDoHarness } from "./doHarness";

describeBookmarkRepositoryContract(createDoHarness);
