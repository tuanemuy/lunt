import { describeRoleRosterRepositoryContract } from "@repo/core/adapters/do/__conformance__/roleRosterRepository";
import { createDoHarness } from "./doHarness";

describeRoleRosterRepositoryContract(createDoHarness);
