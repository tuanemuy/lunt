import { describeAccountRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/accountRepository";
import { createDoHarness } from "./doHarness";

describeAccountRepositoryContract(createDoHarness);
