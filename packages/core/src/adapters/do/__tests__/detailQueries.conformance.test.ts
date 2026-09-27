import { describeDetailQueriesContract } from "../__conformance__/detailQueries";
import { createNodeDiscoveryHarness } from "../testing/nodeDiscoveryHarness";

describeDetailQueriesContract(createNodeDiscoveryHarness);
