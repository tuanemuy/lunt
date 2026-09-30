import { describeFeedCandidateQueriesContract } from "@repo/core/adapters/do/__conformance__/feedCandidateQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeFeedCandidateQueriesContract(createDiscoveryDoHarness);
