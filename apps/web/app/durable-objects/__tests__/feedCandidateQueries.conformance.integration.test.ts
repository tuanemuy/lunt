import { describeFeedCandidateQueriesContract } from "@repo/core/adapters/durableObject/__conformance__/feedCandidateQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeFeedCandidateQueriesContract(createDiscoveryDoHarness);
