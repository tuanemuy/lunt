import { describeUnitOfWorkContract } from "@repo/core/adapters/do/__conformance__/unitOfWork";
import { createDoHarness } from "./doHarness";

describeUnitOfWorkContract(createDoHarness);
