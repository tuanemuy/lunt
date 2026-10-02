import { describeUnitOfWorkContract } from "@repo/core/adapters/durableObject/__conformance__/unitOfWork";
import { createDoHarness } from "./doHarness";

describeUnitOfWorkContract(createDoHarness);
