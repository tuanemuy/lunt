import { describeExplorationQueriesContract } from "../__conformance__/explorationQueries";
import { createNodeDiscoveryHarness } from "../testing/nodeDiscoveryHarness";

describeExplorationQueriesContract(createNodeDiscoveryHarness);
