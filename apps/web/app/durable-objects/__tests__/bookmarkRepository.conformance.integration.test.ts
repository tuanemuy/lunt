import { describeBookmarkRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/bookmarkRepository";
import { createDoHarness } from "./doHarness";

describeBookmarkRepositoryContract(createDoHarness);
