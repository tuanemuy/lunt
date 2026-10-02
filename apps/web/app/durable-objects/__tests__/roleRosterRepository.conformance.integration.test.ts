import { describeRoleRosterRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/roleRosterRepository";
import { createDoHarness } from "./doHarness";

describeRoleRosterRepositoryContract(createDoHarness);
