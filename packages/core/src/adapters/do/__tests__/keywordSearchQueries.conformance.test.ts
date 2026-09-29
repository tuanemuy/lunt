import { describeKeywordSearchQueriesContract } from "../__conformance__/keywordSearchQueries";
import { createNodeDiscoveryHarness } from "../testing/nodeDiscoveryHarness";

describeKeywordSearchQueriesContract(createNodeDiscoveryHarness);
