import { describeLoginChallengeRepositoryContract } from "@repo/core/adapters/do/__conformance__/loginChallengeRepository";
import { createDoHarness } from "./doHarness";

describeLoginChallengeRepositoryContract(createDoHarness);
