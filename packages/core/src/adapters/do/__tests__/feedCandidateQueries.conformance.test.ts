import { describeFeedCandidateQueriesContract } from "../__conformance__/feedCandidateQueries";
import { createNodeDiscoveryHarness } from "../testing/nodeDiscoveryHarness";

describeFeedCandidateQueriesContract(createNodeDiscoveryHarness);
