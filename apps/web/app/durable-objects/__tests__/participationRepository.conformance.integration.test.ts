import { describeParticipationRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/participationRepository";
import { createDoHarness } from "./doHarness";

describeParticipationRepositoryContract(createDoHarness);
