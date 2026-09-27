import { describeAccountRepositoryContract } from "@repo/core/adapters/do/__conformance__/accountRepository";
import { createDoHarness } from "./doHarness";

describeAccountRepositoryContract(createDoHarness);
