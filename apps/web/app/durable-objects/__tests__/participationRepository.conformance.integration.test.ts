import { describeParticipationRepositoryContract } from "@repo/core/adapters/do/__conformance__/participationRepository";
import { createDoHarness } from "./doHarness";

describeParticipationRepositoryContract(createDoHarness);
