import { describeLoginChallengeRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/loginChallengeRepository";
import { createDoHarness } from "./doHarness";

describeLoginChallengeRepositoryContract(createDoHarness);
