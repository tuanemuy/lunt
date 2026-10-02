import { describeKeywordSearchQueriesContract } from "@repo/core/adapters/durableObject/__conformance__/keywordSearchQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeKeywordSearchQueriesContract(createDiscoveryDoHarness);
