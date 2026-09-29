import { describeKeywordSearchQueriesContract } from "@repo/core/adapters/do/__conformance__/keywordSearchQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeKeywordSearchQueriesContract(createDiscoveryDoHarness);
